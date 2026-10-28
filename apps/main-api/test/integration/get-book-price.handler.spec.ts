import type { INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import {
  GetBookPriceQuery,
  type BookPrice,
} from '../../src/contracts/catalog/get-book-price.query.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';
import { insertBook, insertStock, uniqueIsbn } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('GetBookPriceHandler (PostgreSQL real, por el QueryBus)', () => {
  let app: INestApplication;
  let queryBus: QueryBus;

  beforeAll(async () => {
    app = await createTestApp(CatalogModule);
    queryBus = app.get(QueryBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const priceOf = (isbn: string) =>
    queryBus.execute(new GetBookPriceQuery(isbn));

  it('devuelve el libro con el precio como { amount, currency }', async () => {
    const book = await insertBook({
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: '45.00',
    });

    const result: BookPrice = await priceOf(book.isbn);

    expect(result).toEqual({
      isbn: book.isbn,
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: { amount: '45.00', currency: 'PEN' },
    });
  });

  it('respeta la moneda del libro: USD', async () => {
    const book = await insertBook({ price: '15.00', currency: 'USD' });
    expect((await priceOf(book.isbn)).price).toEqual({
      amount: '15.00',
      currency: 'USD',
    });
  });

  it('el monto es texto con 2 decimales, nunca number', async () => {
    const entero = await insertBook({ price: '45' });
    const medio = await insertBook({ price: '0.5' });
    const grande = await insertBook({ price: '1234567.89' });

    for (const [book, amount] of [
      [entero, '45.00'],
      [medio, '0.50'],
      [grande, '1234567.89'],
    ] as const) {
      const { price } = await priceOf(book.isbn);
      expect(typeof price.amount).toBe('string');
      expect(price.amount).toBe(amount);
    }
  });

  it('un libro inexistente da NotFoundError', async () => {
    const isbn = uniqueIsbn();
    const error = await priceOf(isbn).catch((e: Error) => e);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).code).toBe('NOT_FOUND');
    expect((error as Error).message).toContain(isbn);
  });

  it('un libro inactivo se trata como inexistente, aunque tenga stock', async () => {
    const book = await insertBook({ active: false });
    await insertStock(book.isbn, 10);

    await expect(priceOf(book.isbn)).rejects.toThrow(NotFoundError);
  });

  it('no depende del inventario: un libro sin registro de stock se puede valorizar', async () => {
    const book = await insertBook();
    expect((await priceOf(book.isbn)).isbn).toBe(book.isbn);
  });

  it('solo lee: no modifica el libro', async () => {
    const book = await insertBook({ price: '45.00' });
    await priceOf(book.isbn);
    const [row] = await query<{ price: string }>(
      'SELECT price::text AS price FROM catalog.books WHERE isbn = $1',
      [book.isbn],
    );
    expect(row.price).toBe('45.00');
  });
});
