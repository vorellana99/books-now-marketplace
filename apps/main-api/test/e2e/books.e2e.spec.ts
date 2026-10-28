import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { configureSwagger } from '../../src/platform/http/configure-swagger.js';
import { insertBook, insertStock, uniqueIsbn } from '../support/builders.js';
import { resetDatabase } from '../support/database.js';

describe('GET /books/:isbn (e2e, PostgreSQL real)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    configureSwagger(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const get = (isbn: string) =>
    request(app.getHttpServer()).get(`/books/${isbn}`);

  it('200 con el libro y el precio como { amount, currency }', async () => {
    const book = await insertBook({
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: '45.00',
    });

    const res = await get(book.isbn).expect(200);

    expect(res.body).toEqual({
      isbn: book.isbn,
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: { amount: '45.00', currency: 'PEN' },
    });
  });

  it('muestra un libro en dólares con su moneda', async () => {
    const book = await insertBook({ price: '15.00', currency: 'USD' });
    const res = await get(book.isbn).expect(200);
    expect(res.body.price).toEqual({ amount: '15.00', currency: 'USD' });
  });

  it('acepta el ISBN con guiones y devuelve el normalizado', async () => {
    const book = await insertBook({ isbn: '9780132350884' });
    const res = await get('978-0-13-235088-4').expect(200);
    expect(res.body.isbn).toBe(book.isbn);
  });

  it('404 NOT_FOUND si el libro no existe', async () => {
    const isbn = uniqueIsbn();
    const res = await get(isbn).expect(404);
    expect(res.body).toEqual({
      statusCode: 404,
      errorCode: 'NOT_FOUND',
      message: expect.stringContaining(isbn),
    });
  });

  it('404 si el libro está inactivo, aunque tenga stock', async () => {
    const book = await insertBook({ active: false });
    await insertStock(book.isbn, 10);
    const res = await get(book.isbn).expect(404);
    expect(res.body.errorCode).toBe('NOT_FOUND');
  });

  it.each([
    ['muy corto', '123'],
    ['con letras', 'abcdefghijklm'],
    ['dígito de control incorrecto', '9780306406158'],
  ])('422 INVALID_ISBN si el ISBN es %s', async (_caso, isbn) => {
    const res = await get(isbn).expect(422);
    expect(res.body).toMatchObject({
      statusCode: 422,
      errorCode: 'INVALID_ISBN',
    });
  });

  it('devuelve el X-Request-Id que recibe, también en los errores', async () => {
    const book = await insertBook();
    const ok = await get(book.isbn).set('X-Request-Id', 'r-libro');
    expect(ok.headers['x-request-id']).toBe('r-libro');

    const notFound = await get(uniqueIsbn()).set('X-Request-Id', 'r-error');
    expect(notFound.headers['x-request-id']).toBe('r-error');
  });

  it('genera un X-Request-Id si no llega ninguno', async () => {
    const res = await get(uniqueIsbn());
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  describe('GET /books (buscar y listar)', () => {
    const list = (query = '') =>
      request(app.getHttpServer()).get(`/books${query}`);

    it('200 con la página, el tamaño y el total por defecto', async () => {
      await insertBook({ title: 'Clean Code' });

      const res = await list().expect(200);

      expect(res.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].price).toEqual({
        amount: '45.00',
        currency: 'PEN',
      });
    });

    it('busca con ?q= y pagina con page y pageSize', async () => {
      for (const t of ['Java 1', 'Java 2', 'Java 3', 'Otro']) {
        await insertBook({ title: t });
      }

      const res = await list('?q=java&page=2&pageSize=2').expect(200);

      expect(res.body.items.map((b: { title: string }) => b.title)).toEqual([
        'Java 3',
      ]);
      expect(res.body).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    });

    it('recorta los espacios del texto de búsqueda', async () => {
      await insertBook({ title: 'Clean Code' });
      const res = await list('?q=%20%20clean%20%20').expect(200);
      expect(res.body.total).toBe(1);
    });

    it('GET /books/:isbn sigue funcionando junto a GET /books', async () => {
      const book = await insertBook();
      await request(app.getHttpServer()).get(`/books/${book.isbn}`).expect(200);
    });

    it.each([
      ['page 0', '?page=0'],
      ['page negativa', '?page=-1'],
      ['page decimal', '?page=1.5'],
      ['page con letras', '?page=abc'],
      ['page desmesurada', '?page=100001'],
      ['pageSize 0', '?pageSize=0'],
      ['pageSize mayor que 50', '?pageSize=51'],
      ['pageSize con letras', '?pageSize=muchos'],
      ['q repetida', '?q=a&q=b'],
      ['q demasiado larga', `?q=${'x'.repeat(101)}`],
      ['un parámetro desconocido', '?orden=precio'],
    ])('400 si %s', async (_caso, query) => {
      await list(query).expect(400);
    });

    it('acepta pageSize 50, el máximo, y q de 100 caracteres', async () => {
      await list('?pageSize=50').expect(200);
      await list(`?q=${'x'.repeat(100)}`).expect(200);
    });

    it('documenta los parámetros y las respuestas en Swagger', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const operation = res.body.paths['/books'].get;

      expect(operation.tags).toContain('books');
      expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual(
        expect.arrayContaining(['page', 'pageSize', 'q']),
      );
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['200', '400']),
      );
    });
  });

  describe('documentación (Swagger)', () => {
    it('/docs-json describe el endpoint con sus respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const operation = res.body.paths['/books/{isbn}'].get;

      expect(operation.tags).toContain('books');
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['200', '404', '422']),
      );
      expect(
        operation.parameters.map((p: { name: string }) => p.name),
      ).toContain('isbn');
    });

    it('el esquema de la respuesta incluye el precio como { amount, currency }', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const schemas = res.body.components.schemas;

      expect(Object.keys(schemas.BookResponse.properties)).toEqual(
        expect.arrayContaining(['isbn', 'title', 'author', 'price']),
      );
      expect(Object.keys(schemas.MoneyResponse.properties)).toEqual([
        'amount',
        'currency',
      ]);
    });
  });
});
