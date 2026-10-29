import type { QueryBus } from '@nestjs/cqrs';
import { type BookPrice } from '../../src/contracts/catalog/get-book-price.query.js';
import { GetBooksPricesQuery } from '../../src/contracts/catalog/get-books-prices.query.js';
import { CatalogInProcessAdapter } from '../../src/contexts/sales/infrastructure/order/catalog-in-process.adapter.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';

const book = (isbn: string, amount: string, currency: 'PEN' | 'USD' = 'PEN') =>
  ({
    isbn,
    title: `Libro ${isbn}`,
    author: 'Autor',
    price: { amount, currency },
  }) satisfies BookPrice;

function setup(books: BookPrice[]) {
  const execute = vi.fn((q: unknown) =>
    Promise.resolve(
      books.filter((b) => (q as GetBooksPricesQuery).isbns.includes(b.isbn)),
    ),
  );
  const adapter = new CatalogInProcessAdapter({
    execute,
  } as unknown as QueryBus);
  return { adapter, execute };
}

describe('CatalogInProcessAdapter.priceCart', () => {
  it('pide todos los precios con UNA sola consulta, no una por línea', async () => {
    const { adapter, execute } = setup([
      book('A', '10.00'),
      book('B', '20.00'),
    ]);

    await adapter.priceCart([
      { isbn: 'A', quantity: 1 },
      { isbn: 'B', quantity: 2 },
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    const sent: unknown = execute.mock.calls[0]?.[0];
    expect(sent).toBeInstanceOf(GetBooksPricesQuery);
    expect(sent).toMatchObject({ isbns: ['A', 'B'] });
  });

  it('devuelve una línea por cada línea del carrito, en su orden y con su cantidad', async () => {
    const { adapter } = setup([book('A', '10.00'), book('B', '20.00', 'USD')]);

    expect(
      await adapter.priceCart([
        { isbn: 'B', quantity: 2 },
        { isbn: 'A', quantity: 3 },
      ]),
    ).toEqual([
      {
        isbn: 'B',
        quantity: 2,
        title: 'Libro B',
        price: '20.00',
        currency: 'USD',
      },
      {
        isbn: 'A',
        quantity: 3,
        title: 'Libro A',
        price: '10.00',
        currency: 'PEN',
      },
    ]);
  });

  it('un libro repetido en dos líneas da dos líneas con el mismo precio', async () => {
    const { adapter } = setup([book('A', '10.00')]);

    const result = await adapter.priceCart([
      { isbn: 'A', quantity: 1 },
      { isbn: 'A', quantity: 4 },
    ]);

    expect(result.map((l) => [l.isbn, l.quantity, l.price])).toEqual([
      ['A', 1, '10.00'],
      ['A', 4, '10.00'],
    ]);
  });

  it('un carrito vacío no consulta nada', async () => {
    const { adapter, execute } = setup([]);

    expect(await adapter.priceCart([])).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('el error del catálogo llega tal cual', async () => {
    const execute = vi.fn(() => Promise.reject(new NotFoundError('Book', 'Z')));
    const adapter = new CatalogInProcessAdapter({
      execute,
    } as unknown as QueryBus);

    await expect(
      adapter.priceCart([{ isbn: 'Z', quantity: 1 }]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('si el catálogo no devuelve un libro pedido, es NotFoundError (nunca una línea sin precio)', async () => {
    const incomplete = vi.fn(() => Promise.resolve([book('A', '10.00')]));
    const adapter = new CatalogInProcessAdapter({
      execute: incomplete,
    } as unknown as QueryBus);

    await expect(
      adapter.priceCart([
        { isbn: 'A', quantity: 1 },
        { isbn: 'B', quantity: 1 },
      ]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
