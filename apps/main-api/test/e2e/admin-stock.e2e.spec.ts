import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { bearer } from '../support/auth.js';
import { insertBook, insertStock, stockOf } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const ISBN = '9780132350884';

describe('POST /admin/stock/:isbn/additions (e2e, aplicación y PostgreSQL reales)', () => {
  describe('con un administrador', () => {
    let app: INestApplication;
    let admin: { Authorization: string };
    beforeAll(async () => {
      app = await createHttpApp([InventoryModule, IdentityModule, AUTH_MODULE]);
      admin = await bearer(app, 'ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      await resetDatabase();
      await insertBook({ isbn: ISBN });
      await insertStock(ISBN, 5, 2);
    });

    const post = (body: unknown, isbn = ISBN) =>
      request(app.getHttpServer())
        .post(`/admin/stock/${isbn}/additions`)
        .set(admin)
        .send(body as object);

    it('201 con el nivel de stock resultante', async () => {
      const res = await post({ quantity: 10 }).expect(201);
      expect(res.body).toEqual({ isbn: ISBN, available: 15, reserved: 2 });
      expect(await stockOf(ISBN)).toEqual({ available: 15, reserved: 2 });
    });

    it('acepta el ISBN con guiones en la ruta', async () => {
      const res = await post({ quantity: 1 }, '978-0-13-235088-4').expect(201);
      expect(res.body.isbn).toBe(ISBN);
    });

    it('cargas sucesivas acumulan', async () => {
      await post({ quantity: 10 }).expect(201);
      const res = await post({ quantity: 10 }).expect(201);
      expect(res.body.available).toBe(25);
    });

    it('un libro sin registro de stock: 422 STOCK_ITEM_NOT_FOUND, y no se crea', async () => {
      const other = await insertBook();
      const res = await post({ quantity: 5 }, other.isbn).expect(422);
      expect(res.body).toMatchObject({
        statusCode: 422,
        errorCode: 'STOCK_ITEM_NOT_FOUND',
      });
      expect(await stockOf(other.isbn)).toBeUndefined();
    });

    it('un ISBN mal formado: 422 INVALID_ISBN', async () => {
      const res = await post({ quantity: 5 }, '123').expect(422);
      expect(res.body.errorCode).toBe('INVALID_ISBN');
    });

    it('pasar del tope de lo disponible: 422 STOCK_LIMIT_EXCEEDED, sin cambios', async () => {
      await query(
        'UPDATE inventory.stock_items SET available = 999995 WHERE isbn = $1',
        [ISBN],
      );
      const res = await post({ quantity: 6 }).expect(422);
      expect(res.body.errorCode).toBe('STOCK_LIMIT_EXCEEDED');
      expect((await stockOf(ISBN))?.available).toBe(999995);
    });

    it.each([
      ['sin quantity', {}],
      ['quantity 0', { quantity: 0 }],
      ['quantity negativa', { quantity: -5 }],
      ['quantity decimal', { quantity: 1.5 }],
      ['quantity como texto', { quantity: '5' }],
      ['quantity null', { quantity: null }],
      ['quantity booleana', { quantity: true }],
      ['quantity mayor que el máximo por carga', { quantity: 100001 }],
      ['quantity desmesurada', { quantity: 1e12 }],
      ['campo extra: available', { quantity: 5, available: 100 }],
      ['campo extra: isbn', { quantity: 5, isbn: '9780306406157' }],
    ])('400 si %s, sin cambios', async (_caso, body) => {
      await post(body).expect(400);
      expect(await stockOf(ISBN)).toEqual({ available: 5, reserved: 2 });
    });

    it('acepta el máximo por carga, 100000', async () => {
      const res = await post({ quantity: 100000 }).expect(201);
      expect(res.body.available).toBe(100005);
    });

    it('400 sin cuerpo y con JSON roto', async () => {
      await request(app.getHttpServer())
        .post(`/admin/stock/${ISBN}/additions`)
        .set(admin)
        .expect(400);
      await request(app.getHttpServer())
        .post(`/admin/stock/${ISBN}/additions`)
        .set(admin)
        .set('Content-Type', 'application/json')
        .send('{"quantity":')
        .expect(400);
    });

    it('lleva el X-Request-Id', async () => {
      const res = await post({ quantity: 1 })
        .set('X-Request-Id', 'r-stock')
        .expect(201);
      expect(res.headers['x-request-id']).toBe('r-stock');
    });

    it('lo documenta con la etiqueta admin, el parámetro isbn y sus respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const operation = res.body.paths['/admin/stock/{isbn}/additions'].post;
      expect(operation.tags).toContain('admin');
      expect(
        operation.parameters.map((p: { name: string }) => p.name),
      ).toContain('isbn');
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['201', '400', '401', '403', '422']),
      );
      expect(
        Object.keys(res.body.components.schemas.AddStockDto.properties),
      ).toEqual(['quantity']);
      expect(
        Object.keys(
          res.body.components.schemas.StockLevelResponse.properties,
        ).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['available', 'isbn', 'reserved']);
    });

    describe('quién puede llamarla', () => {
      it('sin token 401, también con un cuerpo inválido, y no cambia el stock', async () => {
        for (const body of [{ quantity: 10 }, { nada: true }]) {
          await request(app.getHttpServer())
            .post(`/admin/stock/${ISBN}/additions`)
            .send(body)
            .expect(401);
        }
        expect(await stockOf(ISBN)).toEqual({ available: 5, reserved: 2 });
      });

      it('un comprador recibe 403 FORBIDDEN y no cambia el stock', async () => {
        const res = await request(app.getHttpServer())
          .post(`/admin/stock/${ISBN}/additions`)
          .set(await bearer(app, 'BUYER'))
          .send({ quantity: 10 })
          .expect(403);
        expect(res.body.errorCode).toBe('FORBIDDEN');
        expect(await stockOf(ISBN)).toEqual({ available: 5, reserved: 2 });
      });

      it('la documentación la muestra con la etiqueta admin y sus errores de acceso', async () => {
        const res = await request(app.getHttpServer())
          .get('/docs-json')
          .expect(200);
        const operation = res.body.paths['/admin/stock/{isbn}/additions'].post;
        expect(operation.tags).toContain('admin');
        expect(Object.keys(operation.responses)).toEqual(
          expect.arrayContaining(['201', '400', '401', '403', '422']),
        );
      });
    });
  });
});
