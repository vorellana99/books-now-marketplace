import { execFileSync } from 'node:child_process';
import {
  BOOKS,
  CUSTOMERS,
  DEV_PASSWORD,
  STOCK,
  USERS,
} from '../../prisma/seed-data.js';
import { ScryptPasswordHasher } from '../../src/contexts/identity/infrastructure/scrypt-password-hasher.js';
import { query, resetDatabase } from '../support/database.js';

// El mismo comando que usa quien desarrolla: pnpm run db:seed
const runSeed = () =>
  execFileSync('pnpm', ['run', 'db:seed'], { env: process.env, stdio: 'pipe' });

const count = async (table: string) =>
  Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n,
  );

describe('pnpm run db:seed (PostgreSQL real)', () => {
  beforeEach(resetDatabase);

  it('carga clientes, libros y stock de ejemplo', async () => {
    runSeed();

    expect(await count('sales.customers')).toBe(CUSTOMERS.length);
    expect(await count('catalog.books')).toBe(BOOKS.length);
    expect(await count('inventory.stock_items')).toBe(STOCK.length);
  });

  it('guarda los valores tal cual: moneda, estado activo y premium', async () => {
    runSeed();

    for (const book of BOOKS) {
      const [row] = await query<{
        price: string;
        currency: string;
        active: boolean;
      }>(
        'SELECT price::text AS price, currency::text AS currency, active FROM catalog.books WHERE isbn = $1',
        [book.isbn],
      );
      expect(row, book.title).toMatchObject({
        currency: book.currency,
        active: book.active,
      });
      expect(Number(row.price)).toBe(Number(book.price));
    }
    for (const customer of CUSTOMERS) {
      const [row] = await query<{ premium: boolean }>(
        'SELECT premium FROM sales.customers WHERE id = $1',
        [customer.id],
      );
      expect(row.premium).toBe(customer.premium);
    }
  });

  it('ejecutarlo dos veces no duplica nada', async () => {
    runSeed();
    runSeed();

    expect(await count('sales.customers')).toBe(CUSTOMERS.length);
    expect(await count('catalog.books')).toBe(BOOKS.length);
    expect(await count('inventory.stock_items')).toBe(STOCK.length);
  });

  it('al repetirlo restaura los datos del catálogo pero no pisa el stock existente', async () => {
    runSeed();
    const [first] = BOOKS;
    await query(
      "UPDATE catalog.books SET title = 'Título editado' WHERE isbn = $1",
      [first.isbn],
    );
    await query(
      'UPDATE inventory.stock_items SET available = 3 WHERE isbn = $1',
      [STOCK[0].isbn],
    );

    runSeed();

    const [book] = await query<{ title: string }>(
      'SELECT title FROM catalog.books WHERE isbn = $1',
      [first.isbn],
    );
    const [stock] = await query<{ available: number }>(
      'SELECT available FROM inventory.stock_items WHERE isbn = $1',
      [STOCK[0].isbn],
    );
    expect(book.title).toBe(first.title);
    expect(stock.available).toBe(3);
  });

  it('al repetirlo restaura a los clientes (por ejemplo, quién es premium)', async () => {
    runSeed();
    const [customer] = CUSTOMERS;
    await query('UPDATE sales.customers SET premium = $1 WHERE id = $2', [
      !customer.premium,
      customer.id,
    ]);

    runSeed();

    const [row] = await query<{ premium: boolean }>(
      'SELECT premium FROM sales.customers WHERE id = $1',
      [customer.id],
    );
    expect(row.premium).toBe(customer.premium);
  });

  it('deja un libro sin registro de stock', async () => {
    runSeed();
    const rows = await query(
      `SELECT b.isbn FROM catalog.books b
       LEFT JOIN inventory.stock_items s ON s.isbn = b.isbn WHERE s.isbn IS NULL`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  describe('los usuarios de ejemplo', () => {
    const users = () =>
      query<{ id: string; email: string; role: string; password_hash: string }>(
        'SELECT id, email, role::text AS role, password_hash FROM identity.users ORDER BY email',
      );

    it('crea un comprador por cada cliente, con su mismo id y correo, y un administrador', async () => {
      runSeed();

      const rows = await users();
      expect(rows.map(({ id, email, role }) => ({ id, email, role }))).toEqual(
        [...USERS]
          .sort((a, b) => a.email.localeCompare(b.email))
          .map(({ id, email, role }) => ({ id, email, role })),
      );
      expect(rows.filter((u) => u.role === 'ADMIN')).toHaveLength(1);
      for (const customer of CUSTOMERS) {
        expect(rows.find((u) => u.id === customer.id)).toMatchObject({
          email: customer.email,
          role: 'BUYER',
        });
      }
    });

    it('todos entran con la contraseña de desarrollo, y no se guarda en claro', async () => {
      runSeed();

      const hasher = new ScryptPasswordHasher({ logN: 4 });
      for (const user of await users()) {
        expect(user.password_hash).not.toContain(DEV_PASSWORD);
        expect(await hasher.verify(DEV_PASSWORD, user.password_hash)).toBe(
          true,
        );
        expect(await hasher.verify('otra contraseña', user.password_hash)).toBe(
          false,
        );
      }
    });

    it('cada usuario lleva su propia sal: dos hashes no son iguales aunque la contraseña lo sea', async () => {
      runSeed();
      const hashes = (await users()).map((u) => u.password_hash);
      expect(new Set(hashes).size).toBe(hashes.length);
    });

    it('usa el costo de PASSWORD_HASH_LOG_N', async () => {
      runSeed();
      for (const user of await users()) {
        expect(user.password_hash.startsWith('scrypt$4$')).toBe(true);
      }
    });

    it('al repetirlo no duplica y restaura el rol y la contraseña', async () => {
      runSeed();
      const [admin] = USERS.filter((u) => u.role === 'ADMIN');
      await query(
        "UPDATE identity.users SET role = 'BUYER', password_hash = 'x' WHERE id = $1",
        [admin.id],
      );

      runSeed();

      const rows = await users();
      expect(rows).toHaveLength(USERS.length);
      const restored = rows.find((u) => u.id === admin.id)!;
      expect(restored.role).toBe('ADMIN');
      expect(
        await new ScryptPasswordHasher({ logN: 4 }).verify(
          DEV_PASSWORD,
          restored.password_hash,
        ),
      ).toBe(true);
    });

    it('se niega a correr con NODE_ENV=production y no escribe nada', async () => {
      const fail = () =>
        execFileSync('pnpm', ['run', 'db:seed'], {
          env: { ...process.env, NODE_ENV: 'production' },
          stdio: 'pipe',
        });

      let output = '';
      try {
        fail();
      } catch (error) {
        const { stdout, stderr } = error as { stdout: Buffer; stderr: Buffer };
        output = stdout.toString() + stderr.toString();
      }

      expect(output).toMatch(/producción/);
      expect(await count('identity.users')).toBe(0);
      expect(await count('sales.customers')).toBe(0);
      expect(await count('catalog.books')).toBe(0);
    });

    it('tampoco corre con NODE_ENV=Production ni con espacios', async () => {
      for (const value of ['Production', ' production ', 'PRODUCTION']) {
        let failed = false;
        try {
          execFileSync('pnpm', ['run', 'db:seed'], {
            env: { ...process.env, NODE_ENV: value },
            stdio: 'pipe',
          });
        } catch {
          failed = true;
        }
        expect(failed, value).toBe(true);
      }
      expect(await count('identity.users')).toBe(0);
    });
  });
});
