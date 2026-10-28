import { execFileSync } from 'node:child_process';
import { BOOKS, CUSTOMERS, STOCK } from '../../prisma/seed-data.js';
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
});
