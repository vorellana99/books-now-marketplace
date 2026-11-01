import type { INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { Client } from 'pg';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { SearchBooksQuery } from '../../src/contexts/catalog/application/use-cases/book/search-books.query.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

// La búsqueda de GET /books?q= hace ILIKE '%texto%' sobre título y autor. Sin un índice de trigramas (pg_trgm) recorre
// toda la tabla; con 50 000 libros eso eran unos 30 ms por consulta (tarea 9.6)
describe('índices de trigramas de la búsqueda de libros (PostgreSQL real)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp(CatalogModule);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  it('la extensión pg_trgm está instalada', async () => {
    const rows = await query(
      "SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'",
    );
    expect(rows).toHaveLength(1);
  });

  it.each([
    ['books_title_trgm_idx', 'title'],
    ['books_author_trgm_idx', 'author'],
  ])('%s es un índice GIN de trigramas sobre %s', async (name, column) => {
    const [row] = await query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'catalog' AND indexname = $1",
      [name],
    );
    expect(row?.indexdef).toMatch(/USING gin/i);
    expect(row?.indexdef).toContain(`${column} gin_trgm_ops`);
  });

  describe('con muchos libros, el índice sirve para la búsqueda', () => {
    beforeEach(async () => {
      await query(
        `INSERT INTO catalog.books (isbn, title, author, price, currency, active)
         SELECT lpad(g::text, 13, '0'),
                'Titulo ' || md5(g::text),
                'Autor ' || md5((g * 7)::text),
                10, 'PEN', true
         FROM generate_series(1, 20000) g`,
      );
      await query(
        `UPDATE catalog.books SET title = 'Zarathustra Rarisimo', author = 'Nietzsche Unico'
         WHERE isbn = lpad('777', 13, '0')`,
      );
      await query('ANALYZE catalog.books');
    });

    // El plan con el recorrido secuencial desactivado: demuestra que el índice sirve para este ILIKE. No se afirma que el
    // planificador lo elija siempre (con una tabla pequeña un recorrido completo puede salirle más barato); con 50 000 libros
    // y un título raro sí lo elige, y esa medición está en la bitácora de la tarea 9.6
    const planOf = async (column: 'title' | 'author', term: string) => {
      const client = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
      });
      await client.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL enable_seqscan = off');
        const result = await client.query(
          `EXPLAIN (FORMAT JSON) SELECT * FROM catalog.books WHERE ${column} ILIKE $1`,
          [`%${term}%`],
        );
        await client.query('ROLLBACK');
        return JSON.stringify(result.rows[0]['QUERY PLAN']);
      } finally {
        await client.end();
      }
    };

    it('por título', async () => {
      const plan = await planOf('title', 'zarathustra');
      expect(plan).toContain('Bitmap Index Scan');
      expect(plan).toContain('books_title_trgm_idx');
    });

    it('por autor', async () => {
      const plan = await planOf('author', 'nietzsche');
      expect(plan).toContain('Bitmap Index Scan');
      expect(plan).toContain('books_author_trgm_idx');
    });

    it('SearchBooksHandler devuelve lo mismo que sin índice: el libro raro, por título o por autor, con cualquier caja', async () => {
      const bus = app.get(QueryBus);
      for (const q of ['zarathustra', 'RARISIMO', 'nietzsche', 'unico']) {
        const page = await bus.execute(new SearchBooksQuery(q, 1, 20));
        expect(page.total).toBe(1);
        expect(page.items[0]?.title).toBe('Zarathustra Rarisimo');
      }
    });
  });
});
