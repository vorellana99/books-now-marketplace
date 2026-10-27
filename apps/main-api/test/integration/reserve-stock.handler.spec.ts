import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { ReserveStockCommand } from '../../src/contracts/inventory/reserve-stock.command.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import {
  insertBook,
  insertStock,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('ReserveStockHandler (PostgreSQL real, por el CommandBus)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;

  beforeAll(async () => {
    app = await createTestApp(InventoryModule);
    commandBus = app.get(CommandBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const reserve = (
    orderId: string,
    lines: { isbn: string; quantity: number }[],
  ) => commandBus.execute(new ReserveStockCommand(orderId, lines));

  // Crea un libro con su registro de stock y devuelve su ISBN
  const bookWithStock = async (available: number, reserved = 0) => {
    const { isbn } = await insertBook();
    await insertStock(isbn, available, reserved);
    return isbn;
  };

  const codeOf = async (promise: Promise<unknown>) =>
    ((await promise.catch((e: DomainError) => e)) as DomainError).code;

  describe('reserva correcta', () => {
    it('descuenta lo disponible, suma lo reservado y crea la reserva HELD', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();

      await reserve(orderId, [{ isbn, quantity: 3 }]);

      expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 });
      expect(await reservationsOf(orderId)).toEqual([
        { isbn, quantity: 3, status: 'HELD' },
      ]);
    });

    it('reserva varias líneas de una vez', async () => {
      const a = await bookWithStock(5);
      const b = await bookWithStock(2);
      const orderId = randomUUID();

      await reserve(orderId, [
        { isbn: a, quantity: 2 },
        { isbn: b, quantity: 2 },
      ]);

      expect(await stockOf(a)).toEqual({ available: 3, reserved: 2 });
      expect(await stockOf(b)).toEqual({ available: 0, reserved: 2 });
      expect(await reservationsOf(orderId)).toHaveLength(2);
    });

    it('permite reservar justo todo lo disponible', async () => {
      const isbn = await bookWithStock(4);
      await reserve(randomUUID(), [{ isbn, quantity: 4 }]);
      expect(await stockOf(isbn)).toEqual({ available: 0, reserved: 4 });
    });

    it('suma sobre lo que otros pedidos ya tenían reservado', async () => {
      const isbn = await bookWithStock(10, 5);
      await reserve(randomUUID(), [{ isbn, quantity: 2 }]);
      expect(await stockOf(isbn)).toEqual({ available: 8, reserved: 7 });
    });

    it('no toca el stock de los demás libros', async () => {
      const isbn = await bookWithStock(10);
      const otro = await bookWithStock(10);
      await reserve(randomUUID(), [{ isbn, quantity: 1 }]);
      expect(await stockOf(otro)).toEqual({ available: 10, reserved: 0 });
    });
  });

  describe('sin stock suficiente', () => {
    it('lanza OutOfStockError con el ISBN y no cambia nada', async () => {
      const isbn = await bookWithStock(2);
      const orderId = randomUUID();

      const error = await reserve(orderId, [{ isbn, quantity: 3 }]).catch(
        (e: Error) => e,
      );

      expect(error).toBeInstanceOf(OutOfStockError);
      expect((error as OutOfStockError).code).toBe('OUT_OF_STOCK');
      expect((error as Error).message).toContain(isbn);
      expect(await stockOf(isbn)).toEqual({ available: 2, reserved: 0 });
      expect(await reservationsOf(orderId)).toEqual([]);
    });

    it('un libro agotado (stock en cero) también lanza OutOfStockError', async () => {
      const isbn = await bookWithStock(0);
      await expect(
        reserve(randomUUID(), [{ isbn, quantity: 1 }]),
      ).rejects.toThrow(OutOfStockError);
    });

    it('reserva todo o nada: si falla la segunda línea, la primera se revierte', async () => {
      const ok = await bookWithStock(5);
      const short = await bookWithStock(1);
      const orderId = randomUUID();

      // el orden de ISBN hace que `ok` o `short` vaya primero; el resultado debe ser el mismo
      await expect(
        reserve(orderId, [
          { isbn: ok, quantity: 2 },
          { isbn: short, quantity: 2 },
        ]),
      ).rejects.toThrow(OutOfStockError);

      expect(await stockOf(ok)).toEqual({ available: 5, reserved: 0 });
      expect(await stockOf(short)).toEqual({ available: 1, reserved: 0 });
      expect(await reservationsOf(orderId)).toEqual([]);
    });
  });

  describe('libro sin registro de stock', () => {
    it('lanza StockItemNotFoundError (no OutOfStockError)', async () => {
      const { isbn } = await insertBook(); // existe en el catálogo, pero no en inventario
      const error = await reserve(randomUUID(), [{ isbn, quantity: 1 }]).catch(
        (e: Error) => e,
      );

      expect(error).toBeInstanceOf(StockItemNotFoundError);
      expect((error as StockItemNotFoundError).code).toBe(
        'STOCK_ITEM_NOT_FOUND',
      );
    });

    it('revierte las otras líneas del pedido', async () => {
      const ok = await bookWithStock(5);
      const { isbn: sinRegistro } = await insertBook();
      const orderId = randomUUID();

      await expect(
        reserve(orderId, [
          { isbn: ok, quantity: 1 },
          { isbn: sinRegistro, quantity: 1 },
        ]),
      ).rejects.toThrow(StockItemNotFoundError);

      expect(await stockOf(ok)).toEqual({ available: 5, reserved: 0 });
      expect(await reservationsOf(orderId)).toEqual([]);
    });
  });

  describe('el mismo pedido dos veces', () => {
    it('la segunda reserva da un ConflictError claro y no descuenta de más', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 2 }]);

      const error = await reserve(orderId, [{ isbn, quantity: 2 }]).catch(
        (e: Error) => e,
      );

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe('ORDER_ALREADY_RESERVED');
      expect(await stockOf(isbn)).toEqual({ available: 8, reserved: 2 });
    });

    it('tampoco acepta reservar otros libros para un pedido que ya reservó', async () => {
      const a = await bookWithStock(10);
      const b = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn: a, quantity: 1 }]);

      await expect(
        reserve(orderId, [{ isbn: b, quantity: 1 }]),
      ).rejects.toThrow(ConflictError);
      expect(await stockOf(b)).toEqual({ available: 10, reserved: 0 });
    });
  });

  describe('el mismo pedido a la vez', () => {
    it('dos reservas simultáneas del mismo pedido: una se crea, la otra da ConflictError, y se descuenta una sola vez', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();

      const results = await Promise.allSettled([
        reserve(orderId, [{ isbn, quantity: 2 }]),
        reserve(orderId, [{ isbn, quantity: 2 }]),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(rejected[0].reason).toBeInstanceOf(ConflictError);
      expect(await stockOf(isbn)).toEqual({ available: 8, reserved: 2 });
    });
  });

  describe('entradas inválidas (error de dominio, no el de la base)', () => {
    it('sin líneas', async () => {
      expect(await codeOf(reserve(randomUUID(), []))).toBe('EMPTY_RESERVATION');
    });

    it('un ISBN repetido', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      const code = await codeOf(
        reserve(orderId, [
          { isbn, quantity: 1 },
          { isbn, quantity: 1 },
        ]),
      );
      expect(code).toBe('DUPLICATE_RESERVATION_LINE');
      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'una cantidad inválida (%s)',
      async (quantity) => {
        const isbn = await bookWithStock(10);
        expect(await codeOf(reserve(randomUUID(), [{ isbn, quantity }]))).toBe(
          'INVALID_QUANTITY',
        );
        expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
      },
    );
  });

  describe('pedidos simultáneos', () => {
    it('dos pedidos por el último ejemplar: uno lo consigue y el otro recibe OutOfStockError', async () => {
      const isbn = await bookWithStock(1);

      const results = await Promise.allSettled([
        reserve(randomUUID(), [{ isbn, quantity: 1 }]),
        reserve(randomUUID(), [{ isbn, quantity: 1 }]),
      ]);

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(OutOfStockError);
      expect(await stockOf(isbn)).toEqual({ available: 0, reserved: 1 });
    });

    it('con 5 unidades y 12 pedidos de 1 unidad, se reservan exactamente 5 y nunca queda en negativo', async () => {
      const isbn = await bookWithStock(5);

      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          reserve(randomUUID(), [{ isbn, quantity: 1 }]),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect(await stockOf(isbn)).toEqual({ available: 0, reserved: 5 });
      const [{ n }] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM inventory.reservations',
      );
      expect(Number(n)).toBe(5);
    });
  });
});
