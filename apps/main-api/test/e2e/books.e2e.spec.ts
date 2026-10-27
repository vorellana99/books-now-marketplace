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
