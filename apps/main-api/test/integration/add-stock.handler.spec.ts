import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  AddStockCommand,
  MAX_ADDITION,
  MAX_AVAILABLE,
} from '../../src/contexts/inventory/application/stock/add-stock.command.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { ReserveStockCommand } from '../../src/contracts/inventory/reserve-stock.command.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import { DomainError } from '../../src/shared-kernel/domain.errors.js';
import {
  insertBook,
  insertStock,
  reservationsOf,
  stockOf,
  uniqueIsbn,
} from '../support/builders.js';
import {
  query,
  resetDatabase,
  slowDownStockUpdates,
} from '../support/database.js';
import { createTestApp } from '../support/nest.js';

describe('AddStockHandler (PostgreSQL real, por el CommandBus)', () => {
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

  const add = (isbn: string, quantity: number) =>
    commandBus.execute(new AddStockCommand(isbn, quantity));
  const reserve = (isbn: string, quantity = 1) =>
    commandBus.execute(
      new ReserveStockCommand(randomUUID(), [{ isbn, quantity }]),
    );
  const codeOf = async (promise: Promise<unknown>) =>
    ((await promise.catch((e: unknown) => e)) as DomainError).code;

  describe('sumar unidades', () => {
    it('suma a lo disponible y devuelve el nivel resultante', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 5, 2);

      const level = await add(b.isbn, 10);

      expect(level).toEqual({ isbn: b.isbn, available: 15, reserved: 2 });
      expect(await stockOf(b.isbn)).toEqual({ available: 15, reserved: 2 });
    });

    it('no toca lo reservado ni el stock de otros libros', async () => {
      const a = await insertBook();
      const other = await insertBook();
      await insertStock(a.isbn, 0, 3);
      await insertStock(other.isbn, 9, 1);

      await add(a.isbn, 4);

      expect(await stockOf(a.isbn)).toEqual({ available: 4, reserved: 3 });
      expect(await stockOf(other.isbn)).toEqual({ available: 9, reserved: 1 });
    });

    it('una carga es una suma, no un "fijar en N": cargar dos veces acumula', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 1);
      await add(b.isbn, 5);
      await add(b.isbn, 5);
      expect((await stockOf(b.isbn))?.available).toBe(11);
    });

    it('acepta el ISBN con guiones', async () => {
      const b = await insertBook({ isbn: '9780132350884' });
      await insertStock(b.isbn, 0);
      await add('978-0-13-235088-4', 3);
      expect((await stockOf(b.isbn))?.available).toBe(3);
    });

    it('también un libro desactivado se puede reabastecer antes de reactivarlo', async () => {
      const b = await insertBook({ active: false });
      await insertStock(b.isbn, 0);
      await expect(add(b.isbn, 2)).resolves.toMatchObject({ available: 2 });
    });

    it('lo cargado se puede reservar de inmediato; antes, no', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 0);
      await expect(reserve(b.isbn)).rejects.toBeInstanceOf(OutOfStockError);

      await add(b.isbn, 2);

      await expect(reserve(b.isbn, 2)).resolves.toBeUndefined();
      expect(await stockOf(b.isbn)).toEqual({ available: 0, reserved: 2 });
    });
  });

  describe('límites', () => {
    it.each([
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      '5' as never,
      null as never,
      undefined as never,
    ])(
      'la cantidad %j no es un entero positivo: INVALID_QUANTITY, sin cambios',
      async (quantity) => {
        const b = await insertBook();
        await insertStock(b.isbn, 5);

        expect(await codeOf(add(b.isbn, quantity))).toBe('INVALID_QUANTITY');
        expect((await stockOf(b.isbn))?.available).toBe(5);
      },
    );

    it(`una carga admite hasta ${MAX_ADDITION} unidades y no una más`, async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 0);

      expect(await codeOf(add(b.isbn, MAX_ADDITION + 1))).toBe(
        'INVALID_QUANTITY',
      );
      await expect(add(b.isbn, MAX_ADDITION)).resolves.toMatchObject({
        available: MAX_ADDITION,
      });
    });

    it(`lo disponible no pasa de ${MAX_AVAILABLE}: STOCK_LIMIT_EXCEEDED, sin cambios (y sin desbordar el entero de la base)`, async () => {
      const b = await insertBook();
      await insertStock(b.isbn, MAX_AVAILABLE - 5);

      expect(await codeOf(add(b.isbn, 6))).toBe('STOCK_LIMIT_EXCEEDED');
      expect((await stockOf(b.isbn))?.available).toBe(MAX_AVAILABLE - 5);

      await expect(add(b.isbn, 5)).resolves.toMatchObject({
        available: MAX_AVAILABLE,
      });
    });

    it('con el tope ya alcanzado no se puede cargar ni una unidad', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, MAX_AVAILABLE);
      expect(await codeOf(add(b.isbn, 1))).toBe('STOCK_LIMIT_EXCEEDED');
    });

    it('el tope se mide solo con lo disponible, no con lo reservado', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 0, 500_000);
      await expect(add(b.isbn, 10)).resolves.toMatchObject({
        available: 10,
        reserved: 500_000,
      });
    });
  });

  describe('errores', () => {
    it('un libro sin registro de stock da StockItemNotFoundError y no lo crea', async () => {
      const isbn = uniqueIsbn();
      const error = await add(isbn, 5).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StockItemNotFoundError);
      expect(await query('SELECT 1 FROM inventory.stock_items')).toEqual([]);
    });

    it('un ISBN mal formado da INVALID_ISBN', async () => {
      expect(await codeOf(add('123', 5))).toBe('INVALID_ISBN');
    });
  });

  describe('atomicidad con concurrencia', () => {
    it('veinte cargas a la vez suman todas: ninguna se pierde', async () => {
      const b = await insertBook();
      await insertStock(b.isbn, 0);

      await Promise.all(Array.from({ length: 20 }, () => add(b.isbn, 3)));

      expect((await stockOf(b.isbn))?.available).toBe(60);
    });

    // Cada actualización tarda 40 ms: cargas y reservas se cruzan siempre. Si la carga fuera "leer, sumar y escribir",
    // pisaría a una reserva y el total no cuadraría
    describe('con cargas y reservas cruzadas', () => {
      let removeDelay: (() => Promise<void>) | undefined;
      beforeEach(async () => {
        removeDelay = await slowDownStockUpdates(40);
      });
      afterEach(async () => {
        await removeDelay?.();
        removeDelay = undefined;
      });

      it('diez cargas de 5 y diez reservas de 1 a la vez: el total se conserva', async () => {
        const b = await insertBook();
        await insertStock(b.isbn, 10);
        const orderIds = Array.from({ length: 10 }, () => randomUUID());

        const results = await Promise.allSettled([
          ...Array.from({ length: 10 }, () => add(b.isbn, 5)),
          ...orderIds.map((orderId) =>
            commandBus.execute(
              new ReserveStockCommand(orderId, [{ isbn: b.isbn, quantity: 1 }]),
            ),
          ),
        ]);

        expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
        // disponible + reservado = lo que había + lo cargado: 10 + 10×5 = 60, de lo cual 10 reservadas
        expect(await stockOf(b.isbn)).toEqual({ available: 50, reserved: 10 });
        for (const orderId of orderIds) {
          expect(await reservationsOf(orderId)).toHaveLength(1);
        }
      });
    });
  });

  it('crear la carga no deja reservas ni toca la tabla de reservas', async () => {
    const b = await insertBook();
    await insertStock(b.isbn, 0);
    await add(b.isbn, 5);
    expect(await query('SELECT 1 FROM inventory.reservations')).toEqual([]);
  });
});
