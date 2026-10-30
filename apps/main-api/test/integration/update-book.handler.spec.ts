import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { SearchBooksQuery } from '../../src/contexts/catalog/application/use-cases/book/search-books.query.js';
import { UpdateBookCommand } from '../../src/contexts/catalog/application/use-cases/book/update-book.command.js';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { GetBookPriceQuery } from '../../src/contracts/catalog/get-book-price.query.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import {
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';
import {
  insertBook,
  insertCustomer,
  insertOrder,
  insertStock,
  outboxRows,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

type Changes = ConstructorParameters<typeof UpdateBookCommand>[1];

describe('UpdateBookHandler (PostgreSQL real, por el CommandBus)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, CatalogModule);
    commandBus = app.get(CommandBus);
    queryBus = app.get(QueryBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const update = (isbn: string, changes: Changes) =>
    commandBus.execute(new UpdateBookCommand(isbn, changes));
  const row = async (isbn: string) =>
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
  const codeOf = async (promise: Promise<unknown>) =>
    ((await promise.catch((e: unknown) => e)) as DomainError).code;

  describe('cambiar datos y precio', () => {
    it('el título, y nada más', async () => {
      const b = await insertBook({
        title: 'Viejo',
        author: 'Autor',
        price: '45.00',
      });

      const result = await update(b.isbn, { title: '  Nuevo  ' });

      expect(await row(b.isbn)).toEqual({
        title: 'Nuevo',
        author: 'Autor',
        price: '45.00',
        currency: 'PEN',
        active: true,
      });
      expect(result).toEqual({
        isbn: b.isbn,
        title: 'Nuevo',
        author: 'Autor',
        price: { amount: '45.00', currency: 'PEN' },
        active: true,
      });
    });

    it('el autor, y nada más', async () => {
      const b = await insertBook({ title: 'T', author: 'Viejo' });
      await update(b.isbn, { author: 'Nuevo' });
      expect(await row(b.isbn)).toMatchObject({ title: 'T', author: 'Nuevo' });
    });

    it('el precio, a 2 decimales y sin tocar la moneda', async () => {
      const b = await insertBook({ price: '45.00', currency: 'USD' });

      const result = await update(b.isbn, { price: { amount: '49.9' } });

      expect(await row(b.isbn)).toMatchObject({
        price: '49.90',
        currency: 'USD',
      });
      expect(result.price).toEqual({ amount: '49.90', currency: 'USD' });
    });

    it('todo a la vez, en una sola operación', async () => {
      const b = await insertBook();
      await update(b.isbn, {
        title: 'A',
        author: 'B',
        price: { amount: '10' },
        active: false,
      });
      expect(await row(b.isbn)).toEqual({
        title: 'A',
        author: 'B',
        price: '10.00',
        currency: 'PEN',
        active: false,
      });
    });

    it('acepta el ISBN con guiones', async () => {
      const b = await insertBook({ isbn: '9780132350884' });
      await update('978-0-13-235088-4', { title: 'Nuevo' });
      expect((await row(b.isbn)).title).toBe('Nuevo');
    });

    it('un libro desactivado también se puede editar', async () => {
      const b = await insertBook({ active: false });
      const result = await update(b.isbn, { title: 'Editado' });
      expect(result).toMatchObject({ title: 'Editado', active: false });
    });

    it('no toca los demás libros', async () => {
      const a = await insertBook({ title: 'A' });
      const other = await insertBook({ title: 'Otro', price: '99.00' });
      await update(a.isbn, { title: 'A2', price: { amount: '1.00' } });
      expect(await row(other.isbn)).toMatchObject({
        title: 'Otro',
        price: '99.00',
      });
    });
  });

  describe('la moneda no se cambia (decisión D5)', () => {
    it('indicar la misma moneda está bien', async () => {
      const b = await insertBook({ currency: 'USD' });
      await expect(
        update(b.isbn, { price: { amount: '10', currency: 'USD' } }),
      ).resolves.toBeDefined();
    });

    it('indicar otra moneda da CURRENCY_CANNOT_CHANGE y no cambia nada', async () => {
      const b = await insertBook({
        title: 'Igual',
        price: '45.00',
        currency: 'PEN',
      });

      const code = await codeOf(
        update(b.isbn, {
          title: 'Distinto',
          price: { amount: '10', currency: 'USD' },
        }),
      );

      expect(code).toBe('CURRENCY_CANNOT_CHANGE');
      expect(await row(b.isbn)).toMatchObject({
        title: 'Igual',
        price: '45.00',
        currency: 'PEN',
      });
    });
  });

  describe('desactivar y reactivar (decisión D4)', () => {
    it('un libro desactivado desaparece de la búsqueda y de la consulta de precio, y reactivado vuelve', async () => {
      const b = await insertBook({ title: 'Clean Code' });

      await update(b.isbn, { active: false });
      expect(
        (await queryBus.execute(new SearchBooksQuery('clean', 1, 20))).total,
      ).toBe(0);
      await expect(
        queryBus.execute(new GetBookPriceQuery(b.isbn)),
      ).rejects.toBeInstanceOf(NotFoundError);

      await update(b.isbn, { active: true });
      expect(
        (await queryBus.execute(new SearchBooksQuery('clean', 1, 20))).total,
      ).toBe(1);
      expect(
        (await queryBus.execute(new GetBookPriceQuery(b.isbn))).price.amount,
      ).toBe('45.00');
    });

    it('no borra el libro ni toca su stock', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 7, 2);

      await update(b.isbn, { active: false });

      expect(await row(b.isbn)).toBeDefined();
      expect(await stockOf(b.isbn)).toEqual({ available: 7, reserved: 2 });
    });

    it('desactivar uno ya desactivado no falla', async () => {
      const b = await insertBook({ active: false });
      await expect(update(b.isbn, { active: false })).resolves.toMatchObject({
        active: false,
      });
    });
  });

  describe('un cambio de precio no afecta a los pedidos ya hechos', () => {
    it('la línea del pedido conserva el precio con el que se compró', async () => {
      const b = await insertBook({ price: '45.00' });
      const customer = await insertCustomer();
      const order = await insertOrder(customer.id, {
        lines: [{ isbn: b.isbn, unit_price: '45.000000', quantity: 2 }],
      });

      await update(b.isbn, { price: { amount: '99.00' } });

      const [line] = await query<{ unit_price: string }>(
        'SELECT unit_price::text AS unit_price FROM sales.order_lines WHERE order_id = $1',
        [order.id],
      );
      expect(line.unit_price).toBe('45.000000');
      expect(
        (await queryBus.execute(new GetBookPriceQuery(b.isbn))).price.amount,
      ).toBe('99.00');
    });

    it('un pedido de un libro desactivado se sigue pudiendo leer', async () => {
      const b = await insertBook();
      const customer = await insertCustomer();
      const order = await insertOrder(customer.id, {
        lines: [{ isbn: b.isbn }],
      });

      await update(b.isbn, { active: false });

      expect(
        await query('SELECT 1 FROM sales.order_lines WHERE order_id = $1', [
          order.id,
        ]),
      ).toHaveLength(1);
    });
  });

  describe('errores', () => {
    it('un libro que no existe da NotFoundError', async () => {
      const error = await update('9780132350884', { title: 'x' }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('un ISBN mal formado da INVALID_ISBN', async () => {
      expect(await codeOf(update('123', { title: 'x' }))).toBe('INVALID_ISBN');
    });

    it('sin cambios da NOTHING_TO_UPDATE', async () => {
      const b = await insertBook();
      expect(await codeOf(update(b.isbn, {}))).toBe('NOTHING_TO_UPDATE');
    });

    it('un cambio inválido junto a uno válido no aplica ninguno', async () => {
      const b = await insertBook({ title: 'Igual', price: '45.00' });

      const code = await codeOf(
        update(b.isbn, { title: 'Distinto', price: { amount: '0' } }),
      );

      expect(code).toBe('INVALID_PRICE');
      expect(await row(b.isbn)).toMatchObject({
        title: 'Igual',
        price: '45.00',
      });
    });

    it('no crea ningún evento: editar no avisa a nadie por ahora', async () => {
      const b = await insertBook();
      await update(b.isbn, {
        title: 'Nuevo',
        price: { amount: '1.00' },
        active: false,
      });
      expect(await outboxRows()).toEqual([]);
    });
  });

  it('dos cambios de precio a la vez terminan sin error y queda uno de los dos', async () => {
    const b = await insertBook({ price: '10.00' });

    await Promise.all([
      update(b.isbn, { price: { amount: '20.00' } }),
      update(b.isbn, { price: { amount: '30.00' } }),
    ]);

    expect(['20.00', '30.00']).toContain((await row(b.isbn)).price);
  });

  it('dos cambios simultáneos de campos distintos se conservan los dos', async () => {
    const b = await insertBook({ title: 'T', author: 'A' });

    await Promise.all([
      update(b.isbn, { title: 'Nuevo título' }),
      update(b.isbn, { author: 'Nuevo autor' }),
    ]);

    expect(await row(b.isbn)).toMatchObject({
      title: 'Nuevo título',
      author: 'Nuevo autor',
    });
  });
});
