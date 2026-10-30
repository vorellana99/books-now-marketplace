import { CreateBookCommand } from '../../../src/contexts/catalog/application/use-cases/book/create-book.command.js';
import { CreateBookHandler } from '../../../src/contexts/catalog/application/use-cases/book/create-book.handler.js';
import { GetBookPriceHandler } from '../../../src/contexts/catalog/application/use-cases/book/get-book-price.handler.js';
import { GetBooksPricesHandler } from '../../../src/contexts/catalog/application/use-cases/book/get-books-prices.handler.js';
import { SearchBooksHandler } from '../../../src/contexts/catalog/application/use-cases/book/search-books.handler.js';
import { SearchBooksQuery } from '../../../src/contexts/catalog/application/use-cases/book/search-books.query.js';
import { UpdateBookCommand } from '../../../src/contexts/catalog/application/use-cases/book/update-book.command.js';
import { UpdateBookHandler } from '../../../src/contexts/catalog/application/use-cases/book/update-book.handler.js';
import { GetBookPriceQuery } from '../../../src/contracts/catalog/get-book-price.query.js';
import { GetBooksPricesQuery } from '../../../src/contracts/catalog/get-books-prices.query.js';
import {
  ConflictError,
  type DomainError,
  NotFoundError,
} from '../../../src/shared-kernel/domain.errors.js';
import { InMemoryBooks } from '../../fakes/in-memory-books.js';

const NEW_BOOK = {
  isbn: '978-0-13-235088-4',
  title: ' Clean Code ',
  author: 'Robert C. Martin',
  price: { amount: '45', currency: 'PEN' },
};
const ISBN = '9780132350884';
const code = async (p: Promise<unknown>) =>
  ((await p.catch((e: unknown) => e)) as DomainError).code;

function setup() {
  const books = new InMemoryBooks();
  return {
    books,
    create: new CreateBookHandler(books.repository),
    update: new UpdateBookHandler(books.repository),
    search: new SearchBooksHandler(books.catalog),
    price: new GetBookPriceHandler(books.catalog),
    prices: new GetBooksPricesHandler(books.catalog),
  };
}

describe('CreateBookHandler', () => {
  it('da de alta un libro normalizado y activo, y lo devuelve como lo ve la administración', async () => {
    const w = setup();

    const created = await w.create.execute(new CreateBookCommand(NEW_BOOK));

    expect(created).toEqual({
      isbn: ISBN,
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: { amount: '45.00', currency: 'PEN' },
      active: true,
    });
    expect(w.books.rowOf(ISBN)).toMatchObject({
      title: 'Clean Code',
      active: true,
    });
  });

  it('publica catalog.book.created', async () => {
    const w = setup();

    await w.create.execute(new CreateBookCommand(NEW_BOOK));

    expect(w.books.published().map((e) => e.eventName)).toEqual([
      'catalog.book.created',
    ]);
  });

  it.each([
    ['un ISBN mal formado', { ...NEW_BOOK, isbn: '123' }, 'INVALID_ISBN'],
    [
      'un precio de cero',
      { ...NEW_BOOK, price: { amount: '0', currency: 'PEN' } },
      'INVALID_PRICE',
    ],
    [
      'una moneda que no existe',
      { ...NEW_BOOK, price: { amount: '9', currency: 'EUR' } },
      'INVALID_CURRENCY',
    ],
    ['un título vacío', { ...NEW_BOOK, title: '  ' }, 'INVALID_BOOK'],
  ])(
    '%s es un error de dominio y no guarda nada',
    async (_name, data, expected) => {
      const w = setup();

      expect(await code(w.create.execute(new CreateBookCommand(data)))).toBe(
        expected,
      );
      expect(w.books.count()).toBe(0);
      expect(w.books.published()).toEqual([]);
    },
  );

  it('un ISBN que ya existe es ConflictError BOOK_ALREADY_EXISTS', async () => {
    const w = setup();
    await w.create.execute(new CreateBookCommand(NEW_BOOK));

    const error = await w.create
      .execute(new CreateBookCommand(NEW_BOOK))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('BOOK_ALREADY_EXISTS');
  });
});

describe('UpdateBookHandler', () => {
  it('cambia el libro y lo devuelve; acepta el ISBN con guiones', async () => {
    const w = setup();
    w.books.seed({ isbn: ISBN, title: 'Clean Code' });

    const updated = await w.update.execute(
      new UpdateBookCommand('978-0-13-235088-4', {
        title: 'Código limpio',
        price: { amount: '50' },
      }),
    );

    expect(updated).toMatchObject({
      isbn: ISBN,
      title: 'Código limpio',
      price: { amount: '50.00', currency: 'PEN' },
      active: true,
    });
  });

  it('desactiva un libro', async () => {
    const w = setup();
    w.books.seed({ isbn: ISBN });

    const updated = await w.update.execute(
      new UpdateBookCommand(ISBN, { active: false }),
    );

    expect(updated.active).toBe(false);
  });

  it('un ISBN mal formado es INVALID_ISBN', async () => {
    const w = setup();

    expect(
      await code(w.update.execute(new UpdateBookCommand('x', { title: 'a' }))),
    ).toBe('INVALID_ISBN');
  });

  it('sin ningún cambio es NOTHING_TO_UPDATE y ni siquiera busca el libro', async () => {
    const w = setup();
    const update = vi.spyOn(w.books.repository, 'update');

    expect(await code(w.update.execute(new UpdateBookCommand(ISBN, {})))).toBe(
      'NOTHING_TO_UPDATE',
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('un cambio inválido junto a uno válido rechaza los dos', async () => {
    const w = setup();
    w.books.seed({ isbn: ISBN, title: 'Original' });

    expect(
      await code(
        w.update.execute(
          new UpdateBookCommand(ISBN, {
            title: 'Nuevo',
            price: { amount: '-1' },
          }),
        ),
      ),
    ).toBe('INVALID_PRICE');
    expect(w.books.rowOf(ISBN)?.title).toBe('Original');
  });

  it('un libro que no existe es NotFoundError', async () => {
    const w = setup();

    const error = await w.update
      .execute(new UpdateBookCommand(ISBN, { title: 'a' }))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('otra moneda es CURRENCY_CANNOT_CHANGE y no cambia nada', async () => {
    const w = setup();
    w.books.seed({ isbn: ISBN, currency: 'PEN', price: '45.00' });

    expect(
      await code(
        w.update.execute(
          new UpdateBookCommand(ISBN, {
            price: { amount: '9', currency: 'USD' },
          }),
        ),
      ),
    ).toBe('CURRENCY_CANNOT_CHANGE');
    expect(w.books.rowOf(ISBN)?.price).toBe('45.00');
  });
});

describe('las consultas del catálogo delegan en el puerto de lectura', () => {
  it('SearchBooksHandler', async () => {
    const w = setup();
    w.books.seed({ title: 'Alfa' });
    w.books.seed({ title: 'Beta', active: false });

    const page = await w.search.execute(new SearchBooksQuery(undefined, 1, 20));

    expect(page.items.map((b) => b.title)).toEqual(['Alfa']);
    expect(page.total).toBe(1);
  });

  it('GetBookPriceHandler', async () => {
    const w = setup();
    w.books.seed({ isbn: ISBN, price: '45', currency: 'USD' });

    expect(await w.price.execute(new GetBookPriceQuery(ISBN))).toMatchObject({
      isbn: ISBN,
      price: { amount: '45.00', currency: 'USD' },
    });
    expect(
      await code(w.price.execute(new GetBookPriceQuery('9780306406157'))),
    ).toBe('NOT_FOUND');
  });

  it('GetBooksPricesHandler', async () => {
    const w = setup();
    const a = w.books.seed({ title: 'A' });
    const b = w.books.seed({ title: 'B' });

    const result = await w.prices.execute(
      new GetBooksPricesQuery([b.isbn, a.isbn, b.isbn]),
    );

    expect(result.map((r) => r.isbn)).toEqual([b.isbn, a.isbn]);
  });
});
