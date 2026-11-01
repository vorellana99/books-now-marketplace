import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { CatalogPricing } from '../../src/contexts/sales/domain/ports/catalog-pricing.port.js';
import { StockReservation } from '../../src/contexts/sales/domain/ports/stock-reservation.port.js';
import { CatalogInProcessAdapter } from '../../src/contexts/sales/infrastructure/adapters/catalog-in-process.adapter.js';
import { InventoryInProcessAdapter } from '../../src/contexts/sales/infrastructure/adapters/inventory-in-process.adapter.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import {
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';
import {
  insertBook,
  insertStock,
  reservationsOf,
  stockOf,
  uniqueIsbn,
} from '../support/builders.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('Adaptadores en proceso de Ventas (handlers reales, PostgreSQL real)', () => {
  let app: INestApplication;
  let catalog: CatalogInProcessAdapter;
  let inventory: InventoryInProcessAdapter;

  beforeAll(async () => {
    app = await createTestApp(CatalogModule, InventoryModule);
    catalog = new CatalogInProcessAdapter(app.get(QueryBus));
    inventory = new InventoryInProcessAdapter(app.get(CommandBus));
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  describe('CatalogInProcessAdapter', () => {
    it('cumple el puerto CatalogPricing', () => {
      expect(catalog).toBeInstanceOf(CatalogPricing);
    });

    it('valoriza el carrito con título, precio como texto y moneda, en el mismo orden', async () => {
      const a = await insertBook({ title: 'Clean Code', price: '45.00' });
      const b = await insertBook({ title: 'Refactoring', price: '60.50' });

      const priced = await catalog.priceCart([
        { isbn: b.isbn, quantity: 1 },
        { isbn: a.isbn, quantity: 3 },
      ]);

      expect(priced).toEqual([
        {
          isbn: b.isbn,
          quantity: 1,
          title: 'Refactoring',
          price: '60.50',
          currency: 'PEN',
        },
        {
          isbn: a.isbn,
          quantity: 3,
          title: 'Clean Code',
          price: '45.00',
          currency: 'PEN',
        },
      ]);
      expect(typeof priced[0].price).toBe('string');
    });

    it('conserva la moneda de cada libro: USD llega como USD', async () => {
      const usd = await insertBook({ price: '15.00', currency: 'USD' });

      const [item] = await catalog.priceCart([{ isbn: usd.isbn, quantity: 2 }]);

      expect(item).toMatchObject({ price: '15.00', currency: 'USD' });
    });

    it('un libro que no existe lanza NotFoundError, con su clase y su código', async () => {
      const error = await catalog
        .priceCart([{ isbn: uniqueIsbn(), quantity: 1 }])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).code).toBe('NOT_FOUND');
    });

    it('un libro inactivo también', async () => {
      const book = await insertBook({ active: false });
      await expect(
        catalog.priceCart([{ isbn: book.isbn, quantity: 1 }]),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('si uno de varios falla, falla todo el carrito', async () => {
      const ok = await insertBook();
      await expect(
        catalog.priceCart([
          { isbn: ok.isbn, quantity: 1 },
          { isbn: uniqueIsbn(), quantity: 1 },
        ]),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('un carrito vacío da una lista vacía', async () => {
      expect(await catalog.priceCart([])).toEqual([]);
    });
  });

  describe('InventoryInProcessAdapter', () => {
    it('cumple el puerto StockReservation', () => {
      expect(inventory).toBeInstanceOf(StockReservation);
    });

    it('reserve descuenta el stock y deja la reserva HELD', async () => {
      const book = await insertBook();
      await insertStock(book.isbn, 5);
      const orderId = randomUUID();

      await inventory.reserve(orderId, [{ isbn: book.isbn, quantity: 2 }]);

      expect(await stockOf(book.isbn)).toEqual({ available: 3, reserved: 2 });
      expect(await reservationsOf(orderId)).toEqual([
        { isbn: book.isbn, quantity: 2, status: 'HELD' },
      ]);
    });

    it('sin stock suficiente lanza OutOfStockError y no reserva nada', async () => {
      const ok = await insertBook();
      const short = await insertBook();
      await insertStock(ok.isbn, 5);
      await insertStock(short.isbn, 1);
      const orderId = randomUUID();

      const error = await inventory
        .reserve(orderId, [
          { isbn: ok.isbn, quantity: 1 },
          { isbn: short.isbn, quantity: 2 },
        ])
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OutOfStockError);
      expect((error as OutOfStockError).code).toBe('OUT_OF_STOCK');
      expect(await stockOf(ok.isbn)).toEqual({ available: 5, reserved: 0 });
      expect(await reservationsOf(orderId)).toEqual([]);
    });

    it('un libro sin registro de stock lanza StockItemNotFoundError', async () => {
      const book = await insertBook();
      await expect(
        inventory.reserve(randomUUID(), [{ isbn: book.isbn, quantity: 1 }]),
      ).rejects.toBeInstanceOf(StockItemNotFoundError);
    });

    it('un orderId que no es UUID lanza un DomainError INVALID_ORDER_ID', async () => {
      const error = await inventory
        .reserve('no-es-uuid', [{ isbn: uniqueIsbn(), quantity: 1 }])
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_ORDER_ID');
    });

    it('release devuelve el stock y borra la reserva', async () => {
      const book = await insertBook();
      await insertStock(book.isbn, 5);
      const orderId = randomUUID();
      await inventory.reserve(orderId, [{ isbn: book.isbn, quantity: 2 }]);

      await inventory.release(orderId);

      expect(await stockOf(book.isbn)).toEqual({ available: 5, reserved: 0 });
      expect(await reservationsOf(orderId)).toEqual([]);
    });

    it('release con un orderId que no es UUID propaga el error del handler', async () => {
      const error = await inventory
        .release('no-es-uuid')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('INVALID_ORDER_ID');
    });

    it('release de un pedido sin reservas no hace nada ni falla', async () => {
      await expect(inventory.release(randomUUID())).resolves.toBeUndefined();
    });

    it('release dos veces no devuelve el stock dos veces', async () => {
      const book = await insertBook();
      await insertStock(book.isbn, 5);
      const orderId = randomUUID();
      await inventory.reserve(orderId, [{ isbn: book.isbn, quantity: 2 }]);

      await inventory.release(orderId);
      await inventory.release(orderId);

      expect(await stockOf(book.isbn)).toEqual({ available: 5, reserved: 0 });
    });
  });
});
