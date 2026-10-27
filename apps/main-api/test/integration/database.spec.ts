import { query, resetDatabase } from '../support/database.js';

describe('entorno de integración (PostgreSQL real en un contenedor)', () => {
  beforeEach(resetDatabase);

  it('es PostgreSQL 18, la versión del proyecto', async () => {
    const [row] = await query<{ version: string }>('SELECT version()');
    expect(row.version).toMatch(/^PostgreSQL 18\./);
  });

  it('usa la base de pruebas, no la de desarrollo', async () => {
    const [row] = await query<{ db: string }>(
      'SELECT current_database() AS db',
    );
    expect(row.db).toBe('libroya_test');
  });

  it('tiene las migraciones aplicadas: las tablas de los cuatro schemas existen', async () => {
    const tables = [
      'sales.orders',
      'sales.customers',
      'catalog.books',
      'inventory.stock_items',
      'inventory.reservations',
      'messaging.outbox',
    ];
    for (const table of tables) {
      const [row] = await query<{ found: string | null }>(
        'SELECT to_regclass($1) AS found',
        [table],
      );
      expect(row.found, table).not.toBeNull();
    }
  });

  it('uuidv7() existe (la migración depende de PostgreSQL 18)', async () => {
    const [row] = await query<{ id: string }>('SELECT uuidv7() AS id');
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('los CHECK de la migración están activos', async () => {
    await expect(
      query(
        `INSERT INTO catalog.books (isbn, title, author, price, currency, active)
         VALUES ('9780306406157', 'Libro', 'Autor', 0, 'PEN', true)`,
      ),
    ).rejects.toThrow(/books_price_check/);
  });

  describe('resetDatabase', () => {
    it('vacía los datos de los cuatro schemas', async () => {
      await query(
        `INSERT INTO catalog.books (isbn, title, author, price, currency, active)
         VALUES ('9780306406157', 'Libro', 'Autor', 10, 'PEN', true)`,
      );
      await query(
        `INSERT INTO inventory.stock_items (isbn, available) VALUES ('9780306406157', 5)`,
      );

      await resetDatabase();

      const [books] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM catalog.books',
      );
      const [stock] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM inventory.stock_items',
      );
      expect([books.n, stock.n]).toEqual(['0', '0']);
    });

    it('conserva el historial de migraciones', async () => {
      await resetDatabase();
      const [row] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM public._prisma_migrations',
      );
      expect(Number(row.n)).toBeGreaterThan(0);
    });
  });
});
