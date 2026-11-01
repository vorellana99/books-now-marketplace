import { Module, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { bearer } from '../support/auth.js';
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
  describe('con un administrador', () => {
    let app: INestApplication;
    let admin: { Authorization: string };
    beforeAll(async () => {
      app = await createHttpApp([
        OutboxModule,
        CatalogModule,
        Probes,
        IdentityModule,
        AUTH_MODULE,
      ]);
      admin = await bearer(app, 'ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);

    const post = (body: unknown = BODY) =>
      request(app.getHttpServer())
        .post('/admin/books')
        .set(admin)
        .send(body as object);

    it('201 con el libro creado', async () => {
      const res = await post().expect(201);
      expect(res.body).toEqual({ ...BODY, active: true });
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
      await request(app.getHttpServer())
        .post('/admin/books')
        .set(admin)
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/books')
        .set(admin)
        .set('Content-Type', 'application/json')
        .send('{"isbn":')
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/books')
        .set(admin)
        .set('Content-Type', 'application/json')
        .send('[]')
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/books')
        .set(admin)
        .set('Content-Type', 'application/json')
        .send('null')
        .expect(400);
      expect(await count()).toBe(0);
    });

    it('no crea el stock: no existe hasta que Inventario recibe el evento', async () => {
      await post().expect(201);
      expect(await query('SELECT 1 FROM inventory.stock_items')).toEqual([]);
    });

    describe('PATCH /admin/books/:isbn', () => {
      const isbn = '9780132350884';
      const patch = (body: unknown, path = isbn) =>
        request(app.getHttpServer())
          .patch(`/admin/books/${path}`)
          .set(admin)
          .send(body as object);
      const rowOf = async () =>
        (
          await query<{
            title: string;
            author: string;
            price: string;
            currency: string;
            active: boolean;
          }>(
            'SELECT title, author, price::text AS price, currency::text AS currency, active FROM catalog.books WHERE isbn = $1',
            [isbn],
          )
        )[0];

      beforeEach(async () => {
        await insertBook({
          isbn,
          title: 'Clean Code',
          author: 'Robert C. Martin',
          price: '45.00',
          currency: 'PEN',
        });
      });

      it('200 con el libro cambiado y si está activo', async () => {
        const res = await patch({
          title: '  Código limpio ',
          price: { amount: '49.9' },
        }).expect(200);

        expect(res.body).toEqual({
          isbn,
          title: 'Código limpio',
          author: 'Robert C. Martin',
          price: { amount: '49.90', currency: 'PEN' },
          active: true,
        });
      });

      it('el cambio se ve en las consultas públicas', async () => {
        await patch({
          title: 'Código limpio',
          price: { amount: '49.90' },
        }).expect(200);

        const one = await request(app.getHttpServer())
          .get(`/books/${isbn}`)
          .expect(200);
        const list = await request(app.getHttpServer())
          .get('/books?q=limpio')
          .expect(200);

        expect(one.body).toMatchObject({
          title: 'Código limpio',
          price: { amount: '49.90', currency: 'PEN' },
        });
        expect(list.body.total).toBe(1);
      });

      it('acepta el ISBN con guiones en la ruta', async () => {
        await patch({ title: 'Nuevo' }, '978-0-13-235088-4').expect(200);
        expect((await rowOf()).title).toBe('Nuevo');
      });

      it('desactivar: el libro desaparece del catálogo y de la búsqueda, y reactivar lo devuelve', async () => {
        const off = await patch({ active: false }).expect(200);
        expect(off.body.active).toBe(false);
        await request(app.getHttpServer()).get(`/books/${isbn}`).expect(404);
        expect(
          (await request(app.getHttpServer()).get('/books?q=clean').expect(200))
            .body.total,
        ).toBe(0);
        expect(await rowOf()).toMatchObject({ active: false }); // no se borra

        const on = await patch({ active: true }).expect(200);
        expect(on.body.active).toBe(true);
        await request(app.getHttpServer()).get(`/books/${isbn}`).expect(200);
      });

      it('repetir el mismo cambio da el mismo resultado', async () => {
        const first = await patch({ price: { amount: '60' } }).expect(200);
        const second = await patch({ price: { amount: '60' } }).expect(200);
        expect(second.body).toEqual(first.body);
      });

      it('se puede confirmar la moneda actual dentro del precio', async () => {
        await patch({ price: { amount: '60', currency: 'PEN' } }).expect(200);
      });

      it('422 CURRENCY_CANNOT_CHANGE si se pide otra moneda, y no cambia nada', async () => {
        const res = await patch({
          title: 'Distinto',
          price: { amount: '60', currency: 'USD' },
        }).expect(422);
        expect(res.body.errorCode).toBe('CURRENCY_CANNOT_CHANGE');
        expect(await rowOf()).toMatchObject({
          title: 'Clean Code',
          price: '45.00',
          currency: 'PEN',
        });
      });

      it('404 NOT_FOUND si el libro no existe (con la administración abierta)', async () => {
        const res = await patch({ title: 'x' }, '9780306406157').expect(404);
        expect(res.body).toMatchObject({
          statusCode: 404,
          errorCode: 'NOT_FOUND',
        });
      });

      it('422 INVALID_ISBN con un ISBN mal formado en la ruta', async () => {
        const res = await patch({ title: 'x' }, '123').expect(422);
        expect(res.body.errorCode).toBe('INVALID_ISBN');
      });

      it.each([
        ['precio cero', { price: { amount: '0.00' } }, 'INVALID_PRICE'],
        [
          'precio sobre el máximo',
          { price: { amount: '1000000.01' } },
          'INVALID_PRICE',
        ],
        ['salto de línea en el título', { title: 'Uno\nDos' }, 'INVALID_BOOK'],
        ['salto de línea en el autor', { author: 'Uno\nDos' }, 'INVALID_BOOK'],
      ])('422 %s: %s', async (_caso, body, code) => {
        const res = await patch(body).expect(422);
        expect(res.body.errorCode).toBe(code);
        expect(await rowOf()).toMatchObject({
          title: 'Clean Code',
          price: '45.00',
        });
      });

      it.each([
        ['cuerpo vacío', {}],
        ['todos los campos sin valor', { title: undefined }],
        ['título vacío', { title: '' }],
        ['título de espacios', { title: '   ' }],
        ['título null', { title: null }],
        ['título no es texto', { title: 42 }],
        ['título demasiado largo', { title: 'x'.repeat(201) }],
        ['autor vacío', { author: '' }],
        ['autor null', { author: null }],
        ['autor demasiado largo', { author: 'x'.repeat(151) }],
        ['precio null', { price: null }],
        ['precio como número', { price: 49.9 }],
        ['precio sin monto', { price: {} }],
        ['monto numérico', { price: { amount: 49.9 } }],
        ['monto negativo', { price: { amount: '-1' } }],
        ['monto con 3 decimales', { price: { amount: '1.234' } }],
        ['monto con coma', { price: { amount: '1,5' } }],
        ['moneda desconocida', { price: { amount: '5', currency: 'EUR' } }],
        ['moneda en minúsculas', { price: { amount: '5', currency: 'pen' } }],
        ['moneda null', { price: { amount: '5', currency: null } }],
        ['campo extra en el precio', { price: { amount: '5', discount: '1' } }],
        ['active como texto', { active: 'false' }],
        ['active null', { active: null }],
        ['active como número', { active: 1 }],
        ['isbn en el cuerpo', { isbn: '9780306406157' }],
        ['stock en el cuerpo', { title: 'x', stock: 10 }],
        ['moneda fuera del precio', { currency: 'USD' }],
      ])('400 si %s', async (_caso, body) => {
        await patch(body).expect(400);
        expect(await rowOf()).toEqual({
          title: 'Clean Code',
          author: 'Robert C. Martin',
          price: '45.00',
          currency: 'PEN',
          active: true,
        });
      });

      it('400 sin cuerpo y con JSON roto', async () => {
        await request(app.getHttpServer())
          .patch(`/admin/books/${isbn}`)
          .set(admin)
          .expect(400);
        await request(app.getHttpServer())
          .patch(`/admin/books/${isbn}`)
          .set(admin)
          .set('Content-Type', 'application/json')
          .send('{"title":')
          .expect(400);
        await request(app.getHttpServer())
          .patch(`/admin/books/${isbn}`)
          .set(admin)
          .set('Content-Type', 'application/json')
          .send('[]')
          .expect(400);
      });

      it('no crea eventos ni toca el stock', async () => {
        await patch({ title: 'Nuevo', active: false }).expect(200);
        expect(await outboxRows()).toEqual([]);
        expect(await query('SELECT 1 FROM inventory.stock_items')).toEqual([]);
      });

      it('lo documenta con la etiqueta admin, el parámetro isbn y sus respuestas', async () => {
        const res = await request(app.getHttpServer())
          .get('/docs-json')
          .expect(200);
        const operation = res.body.paths['/admin/books/{isbn}'].patch;
        expect(operation.tags).toContain('admin');
        expect(
          operation.parameters.map((p: { name: string }) => p.name),
        ).toContain('isbn');
        expect(Object.keys(operation.responses)).toEqual(
          expect.arrayContaining(['200', '400', '401', '403', '404', '422']),
        );
        const schemas = res.body.components.schemas;
        expect(
          Object.keys(schemas.UpdateBookDto.properties).sort((a, b) =>
            a.localeCompare(b),
          ),
        ).toEqual(['active', 'author', 'price', 'title']);
        expect(schemas.UpdateBookDto.required ?? []).toEqual([]);
        expect(schemas.AdminBookResponse.properties).toHaveProperty('active');
      });
    });

    it('documenta la operación con la etiqueta admin y sus respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const operation = res.body.paths['/admin/books'].post;
      expect(operation.tags).toContain('admin');
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '409', '422']),
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

    describe('quién puede llamarla', () => {
      it('sin token 401 UNAUTHENTICATED, también con un cuerpo inválido, y no crea nada', async () => {
        for (const body of [BODY, { nada: true }]) {
          const res = await request(app.getHttpServer())
            .post('/admin/books')
            .send(body)
            .expect(401);
          expect(res.body.errorCode).toBe('UNAUTHENTICATED');
        }
        await request(app.getHttpServer())
          .patch('/admin/books/9780132350884')
          .send({ active: false })
          .expect(401);
        expect(await count()).toBe(0);
      });

      it('un comprador recibe 403 FORBIDDEN y no cambia nada', async () => {
        const buyer = await bearer(app, 'BUYER');
        const res = await request(app.getHttpServer())
          .post('/admin/books')
          .set(buyer)
          .send(BODY)
          .expect(403);
        expect(res.body.errorCode).toBe('FORBIDDEN');
        await request(app.getHttpServer())
          .patch('/admin/books/9780132350884')
          .set(buyer)
          .send({ active: false })
          .expect(403);
        expect(await count()).toBe(0);
      });

      it('la documentación muestra las rutas de administración con la etiqueta admin', async () => {
        const res = await request(app.getHttpServer())
          .get('/docs-json')
          .expect(200);
        expect(res.body.paths['/admin/books'].post.tags).toContain('admin');
        expect(res.body.paths['/admin/books/{isbn}'].patch.tags).toContain(
          'admin',
        );
        expect(
          Object.keys(res.body.paths['/admin/books'].post.responses),
        ).toEqual(
          expect.arrayContaining(['201', '400', '401', '403', '409', '422']),
        );
      });
    });
  });
});
