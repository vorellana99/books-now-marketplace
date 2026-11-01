import { BookChanges } from '../../../src/contexts/catalog/domain/model/book/book-changes.js';
import { Book } from '../../../src/contexts/catalog/domain/model/book/book.aggregate.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';

const DATA = {
  isbn: '9780132350884',
  title: 'Clean Code',
  author: 'Robert C. Martin',
  price: { amount: '45.00', currency: 'PEN' },
} as const;

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};
const stored = (
  overrides: Partial<{ active: boolean; currency: 'PEN' | 'USD' }> = {},
) =>
  Book.restore({
    isbn: DATA.isbn,
    title: DATA.title,
    author: DATA.author,
    price: { amount: '45.00', currency: overrides.currency ?? 'PEN' },
    active: overrides.active ?? true,
  });

describe('Book.register: dar de alta un libro', () => {
  it('queda normalizado y activo, con el precio en texto de 2 decimales', () => {
    const book = Book.register({
      isbn: '978-0-13-235088-4',
      title: '  Clean Code ',
      author: ' Robert C. Martin ',
      price: { amount: '45', currency: 'PEN' } as never,
    } as never);

    expect(book.toView()).toEqual({
      isbn: '9780132350884',
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: { amount: '45.00', currency: 'PEN' },
      active: true,
    });
  });

  it('valida igual que NewBook: un ISBN malo, un precio malo o una moneda mala son errores de dominio', () => {
    expect(failure(() => Book.register({ ...DATA, isbn: '123' }))?.code).toBe(
      'INVALID_ISBN',
    );
    expect(
      failure(() =>
        Book.register({ ...DATA, price: { amount: '0', currency: 'PEN' } }),
      )?.code,
    ).toBe('INVALID_PRICE');
    expect(
      failure(() =>
        Book.register({ ...DATA, price: { amount: '9.00', currency: 'EUR' } }),
      )?.code,
    ).toBe('INVALID_CURRENCY');
    expect(failure(() => Book.register({ ...DATA, title: ' ' }))?.code).toBe(
      'INVALID_BOOK',
    );
  });

  it('deja pendiente un solo evento catalog.book.created, con el ISBN normalizado', () => {
    const book = Book.register({ ...DATA, isbn: '978-0-13-235088-4' });

    const events = book.pullEvents();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventName: 'catalog.book.created',
      aggregateId: '9780132350884',
      isbn: '9780132350884',
    });
  });

  it('pullEvents vacía la lista', () => {
    const book = Book.register(DATA);
    book.pullEvents();

    expect(book.pullEvents()).toEqual([]);
  });

  it('un libro recién registrado no trae cambios por guardar como actualización', () => {
    expect(Book.register(DATA).changes()).toEqual({});
  });
});

describe('Book.restore: un libro que ya existe', () => {
  it('no deja eventos ni cambios', () => {
    const book = stored();

    expect(book.pullEvents()).toEqual([]);
    expect(book.changes()).toEqual({});
  });

  it('puede estar inactivo', () => {
    expect(stored({ active: false }).toView().active).toBe(false);
  });
});

describe('Book.apply: cambiar un libro', () => {
  const apply = (book: Book, data: Parameters<typeof BookChanges.create>[0]) =>
    book.apply(BookChanges.create(data));

  it('cambia el título, el autor, el precio y el estado, y anota solo lo que cambió', () => {
    const book = stored();

    apply(book, { title: 'Código limpio' });
    expect(book.changes()).toEqual({ title: 'Código limpio' });

    apply(book, { price: { amount: '50' } });
    expect(book.changes()).toEqual({
      title: 'Código limpio',
      price: { amount: '50.00' },
    });
    expect(book.toView().price).toEqual({ amount: '50.00', currency: 'PEN' });
  });

  it('desactivar y reactivar', () => {
    const book = stored();

    apply(book, { active: false });
    expect(book.toView().active).toBe(false);
    expect(book.changes()).toEqual({ active: false });

    apply(book, { active: true });
    expect(book.toView().active).toBe(true);
  });

  it('el precio con la misma moneda del libro vale; con otra, CURRENCY_CANNOT_CHANGE y no cambia nada', () => {
    const book = stored({ currency: 'PEN' });

    apply(book, { price: { amount: '60', currency: 'PEN' } });
    expect(book.toView().price).toEqual({ amount: '60.00', currency: 'PEN' });

    const error = failure(() =>
      apply(book, { title: 'Otro', price: { amount: '70', currency: 'USD' } }),
    );
    expect(error?.code).toBe('CURRENCY_CANNOT_CHANGE');
    expect(error?.message).toContain(DATA.isbn);
    expect(error?.message).toContain('PEN');
    // el título que iba junto al precio inválido tampoco se aplicó
    expect(book.toView().title).toBe('Clean Code');
    expect(book.toView().price).toEqual({ amount: '60.00', currency: 'PEN' });
  });

  it('el ISBN y la moneda no se cambian: no hay forma de pedirlo', () => {
    const book = stored();

    apply(book, { title: 'Otro' });

    expect(book.toView().isbn).toBe(DATA.isbn);
    expect(book.toView().price.currency).toBe('PEN');
  });

  it('aplicar un cambio vacío no anota nada', () => {
    const book = stored();

    book.apply({});

    expect(book.changes()).toEqual({});
  });
});

describe('Book.toView', () => {
  it('es lo que ve la administración: el libro más si está activo, con el precio como texto', () => {
    expect(stored().toView()).toEqual({
      isbn: DATA.isbn,
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: { amount: '45.00', currency: 'PEN' },
      active: true,
    });
  });
});
