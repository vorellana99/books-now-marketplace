import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { ReleaseStockCommand } from '../../src/contracts/inventory/release-stock.command.js';
import { ReserveStockCommand } from '../../src/contracts/inventory/reserve-stock.command.js';
import { OutOfStockError } from '../../src/contracts/inventory/stock.errors.js';
import type { DomainError } from '../../src/shared-kernel/domain.errors.js';
import {
  insertBook,
  insertStock,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('ReleaseStockHandler (PostgreSQL real, por el CommandBus)', () => {
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
  const release = (orderId: string) =>
    commandBus.execute(new ReleaseStockCommand(orderId));

  const bookWithStock = async (available: number) => {
    const { isbn } = await insertBook();
    await insertStock(isbn, available);
    return isbn;
  };

  describe('devuelve el stock', () => {
    it('suma lo disponible, resta lo reservado y borra la reserva', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 3 }]);

      await release(orderId);

      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
      expect(await reservationsOf(orderId)).toEqual([]);
    });

    it('devuelve todas las líneas del pedido', async () => {
      const a = await bookWithStock(5);
      const b = await bookWithStock(7);
      const orderId = randomUUID();
      await reserve(orderId, [
        { isbn: a, quantity: 2 },
        { isbn: b, quantity: 4 },
      ]);

      await release(orderId);

      expect(await stockOf(a)).toEqual({ available: 5, reserved: 0 });
      expect(await stockOf(b)).toEqual({ available: 7, reserved: 0 });
    });

    it('solo devuelve lo de ese pedido: las reservas de otros pedidos siguen en pie', async () => {
      const isbn = await bookWithStock(10);
      const pedidoA = randomUUID();
      const pedidoB = randomUUID();
      await reserve(pedidoA, [{ isbn, quantity: 2 }]);
      await reserve(pedidoB, [{ isbn, quantity: 3 }]);

      await release(pedidoA);

      expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 });
      expect(await reservationsOf(pedidoB)).toHaveLength(1);
    });

    it('después de liberar, el pedido puede volver a reservar', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 2 }]);
      await release(orderId);

      await reserve(orderId, [{ isbn, quantity: 2 }]);

      expect(await stockOf(isbn)).toEqual({ available: 8, reserved: 2 });
    });
  });

  describe('es idempotente', () => {
    it('liberar dos veces seguidas devuelve el stock una sola vez', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 3 }]);

      await release(orderId);
      await release(orderId);

      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('dos liberaciones simultáneas devuelven el stock una sola vez', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 3 }]);

      await Promise.all([release(orderId), release(orderId)]);

      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('ocho liberaciones simultáneas siguen devolviéndolo una sola vez', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 4 }]);

      await Promise.all(Array.from({ length: 8 }, () => release(orderId)));

      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('un pedido sin reservas no hace nada ni falla', async () => {
      const isbn = await bookWithStock(10);

      await expect(release(randomUUID())).resolves.toBeUndefined();

      expect(await stockOf(isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('tras una reserva fallida por falta de stock, liberar no hace nada', async () => {
      const isbn = await bookWithStock(1);
      const orderId = randomUUID();
      await expect(reserve(orderId, [{ isbn, quantity: 5 }])).rejects.toThrow(
        OutOfStockError,
      );

      await release(orderId);

      expect(await stockOf(isbn)).toEqual({ available: 1, reserved: 0 });
    });
  });

  describe('respeta las reservas confirmadas', () => {
    it('no libera una reserva CONFIRMED', async () => {
      const isbn = await bookWithStock(10);
      const orderId = randomUUID();
      await reserve(orderId, [{ isbn, quantity: 3 }]);
      await query(
        "UPDATE inventory.reservations SET status = 'CONFIRMED' WHERE order_id = $1",
        [orderId],
      );

      await release(orderId);

      expect(await stockOf(isbn)).toEqual({ available: 7, reserved: 3 });
      expect(await reservationsOf(orderId)).toEqual([
        { isbn, quantity: 3, status: 'CONFIRMED' },
      ]);
    });
  });

  describe('es todo o nada', () => {
    it('si una línea no se puede devolver, no se libera ninguna y la reserva se conserva', async () => {
      const a = await bookWithStock(5);
      const b = await bookWithStock(5);
      const orderId = randomUUID();
      await reserve(orderId, [
        { isbn: a, quantity: 2 },
        { isbn: b, quantity: 2 },
      ]);
      // Dato inconsistente: el registro de stock de uno de los libros desapareció
      await query('DELETE FROM inventory.stock_items WHERE isbn = $1', [b]);

      await expect(release(orderId)).rejects.toThrow();

      expect(await reservationsOf(orderId)).toHaveLength(2);
      expect(await stockOf(a)).toEqual({ available: 3, reserved: 2 });
    });
  });

  describe('entradas inválidas', () => {
    it('un orderId que no es un UUID da un error de dominio, no el de la base', async () => {
      const error = await release('no-es-un-uuid').catch((e: DomainError) => e);
      expect((error as DomainError).code).toBe('INVALID_ORDER_ID');
    });
  });
});
