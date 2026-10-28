import { Module, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { insertBook } from '../support/builders.js';
import { outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';
import { BookCreatedProbe } from '../support/outbox-probes.js';

@Module({ providers: [BookCreatedProbe] })
class Probes {}

const BODY = {
  isbn: '9780132350884',
  title: 'Clean Code',
  author: 'Robert C. Martin',
  price: { amount: '45.00', currency: 'PEN' },
};

const count = async () =>
  Number(
    (await query<{ n: string }>('SELECT count(*) AS n FROM catalog.books'))[0]
      .n,
  );

describe('POST /admin/books (e2e, aplicación y PostgreSQL reales)', () => {
  describe('con ADMIN_API_ENABLED=false', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp([OutboxModule, CatalogModule], {
        ADMIN_API_ENABLED: 'false',
      });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);

    it('404 como una ruta que no existe, y no crea nada', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/books')
        .send(BODY)
        .expect(404);

      expect(res.body).toEqual({
        message: 'Cannot POST /admin/books',
        error: 'Not Found',
        statusCode: 404,
      });
      expect(await count()).toBe(0);
    });

    it('un cuerpo inválido también es 404, no 400', async () => {
      await request(app.getHttpServer())
        .post('/admin/books')
        .send({ nada: true })
        .expect(404);
    });

    it('la documentación no muestra /admin/books', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      expect(Object.keys(res.body.paths)).not.toContain('/admin/books');
      expect(Object.keys(res.body.paths)).toContain('/books');
    });
  });

  describe('con ADMIN_API_ENABLED=true', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp([OutboxModule, CatalogModule, Probes], {
        ADMIN_API_ENABLED: 'true',
      });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);

    const post = (body: unknown = BODY) =>
      request(app.getHttpServer())
        .post('/admin/books')
        .send(body as object);

    it('201 con el libro creado', async () => {
      const res = await post().expect(201);
      expect(res.body).toEqual(BODY);
    });

    it('el libro queda activo y se puede ver por su ISBN, en la búsqueda y con el precio en texto', async () => {
      await post().expect(201);

      const one = await request(app.getHttpServer())
        .get('/books/9780132350884')
        .expect(200);
      const list = await request(app.getHttpServer())
        .get('/books?q=clean')
        .expect(200);

      expect(one.body.price).toEqual({ amount: '45.00', currency: 'PEN' });
      expect(list.body.items.map((b: { isbn: string }) => b.isbn)).toEqual([
        '9780132350884',
      ]);
    });

    it('normaliza: ISBN con guiones, título recortado y precio a 2 decimales', async () => {
      const res = await post({
        ...BODY,
        isbn: '978-0-13-235088-4',
        title: '  Clean Code  ',
        price: { amount: '45.5', currency: 'USD' },
      }).expect(201);
      expect(res.body).toMatchObject({
        isbn: '9780132350884',
        title: 'Clean Code',
        price: { amount: '45.50', currency: 'USD' },
      });
    });

    it('guarda el evento con el requestId de la petición', async () => {
      await post().set('X-Request-Id', 'r-alta-libro').expect(201);

      const [event] = await outboxRows();
      expect(event).toMatchObject({
        event_name: 'catalog.book.created',
        aggregate_id: '9780132350884',
        correlation_id: 'r-alta-libro',
      });
    });

    it('409 BOOK_ALREADY_EXISTS si el ISBN ya existe, y el libro no cambia', async () => {
      await post().expect(201);

      const res = await post({
        ...BODY,
        title: 'Otro',
        price: { amount: '1.00', currency: 'PEN' },
      }).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        errorCode: 'BOOK_ALREADY_EXISTS',
      });
      expect(
        (await request(app.getHttpServer()).get('/books/9780132350884')).body
          .title,
      ).toBe('Clean Code');
      expect(await outboxRows()).toHaveLength(1);
    });

    it('un libro ya existente cargado con SQL también da 409', async () => {
      const existing = await insertBook({ isbn: '9780132350884' });
      await post({ ...BODY, isbn: existing.isbn }).expect(409);
    });

    it('422 INVALID_ISBN con un ISBN mal formado', async () => {
      const res = await post({ ...BODY, isbn: '9780132350885' }).expect(422);
      expect(res.body.errorCode).toBe('INVALID_ISBN');
      expect(await count()).toBe(0);
    });

    it.each(['0', '0.00', '1000000.01'])(
      '422 INVALID_PRICE con el precio %s',
      async (amount) => {
        const res = await post({
          ...BODY,
          price: { amount, currency: 'PEN' },
        }).expect(422);
        expect(res.body.errorCode).toBe('INVALID_PRICE');
        expect(await count()).toBe(0);
      },
    );

    it('422 INVALID_BOOK con un salto de línea en el título', async () => {
      const res = await post({ ...BODY, title: 'Clean\nCode' }).expect(422);
      expect(res.body.errorCode).toBe('INVALID_BOOK');
    });

    it.each([
      ['sin isbn', { ...BODY, isbn: undefined }],
      ['isbn vacío', { ...BODY, isbn: '' }],
      ['isbn no es texto', { ...BODY, isbn: 9780132350884 }],
      ['sin título', { ...BODY, title: undefined }],
      ['título vacío', { ...BODY, title: '   ' }],
      ['título demasiado largo', { ...BODY, title: 'x'.repeat(201) }],
      ['sin autor', { ...BODY, author: undefined }],
      ['autor demasiado largo', { ...BODY, author: 'x'.repeat(151) }],
      ['sin precio', { ...BODY, price: undefined }],
      ['precio como número', { ...BODY, price: 45 }],
      [
        'precio con monto numérico',
        { ...BODY, price: { amount: 45, currency: 'PEN' } },
      ],
      [
        'monto negativo',
        { ...BODY, price: { amount: '-5.00', currency: 'PEN' } },
      ],
      [
        'monto con 3 decimales',
        { ...BODY, price: { amount: '5.123', currency: 'PEN' } },
      ],
      [
        'monto con coma',
        { ...BODY, price: { amount: '5,50', currency: 'PEN' } },
      ],
      ['monto vacío', { ...BODY, price: { amount: '', currency: 'PEN' } }],
      ['sin moneda', { ...BODY, price: { amount: '5.00' } }],
      [
        'moneda desconocida',
        { ...BODY, price: { amount: '5.00', currency: 'EUR' } },
      ],
      [
        'moneda en minúsculas',
        { ...BODY, price: { amount: '5.00', currency: 'pen' } },
      ],
      ['campo extra: active', { ...BODY, active: false }],
      ['campo extra: stock', { ...BODY, stock: 100 }],
      [
        'campo extra dentro del precio',
        {
          ...BODY,
          price: { amount: '5.00', currency: 'PEN', discount: '1.00' },
        },
      ],
    ])('400 si %s', async (_caso, body) => {
      await post(body).expect(400);
      expect(await count()).toBe(0);
    });

    it('400 sin cuerpo (ni content-type) y con un cuerpo que no es JSON', async () => {
      await request(app.getHttpServer()).post('/admin/books').expect(400);
      await request(app.getHttpServer())
        .post('/admin/books')
        .set('Content-Type', 'application/json')
        .send('{"isbn":')
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/books')
        .set('Content-Type', 'application/json')
        .send('[]')
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/books')
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400);
      expect(await count()).toBe(0);
    });

    it('no crea el stock: no existe hasta que Inventario recibe el evento', async () => {
      await post().expect(201);
      expect(await query('SELECT 1 FROM inventory.stock_items')).toEqual([]);
    });

    it('documenta la operación con la etiqueta admin y sus respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const operation = res.body.paths['/admin/books'].post;
      expect(operation.tags).toContain('admin');
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['201', '400', '404', '409', '422']),
      );
    });

    it('/docs-json describe el cuerpo con el precio como { amount, currency }', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const schemas = res.body.components.schemas;
      expect(
        Object.keys(schemas.CreateBookDto.properties).sort((a, b) =>
          a.localeCompare(b),
        ),
      ).toEqual(['author', 'isbn', 'price', 'title']);
      expect(Object.keys(schemas.PriceDto.properties)).toEqual([
        'amount',
        'currency',
      ]);
    });
  });
});
