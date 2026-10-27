import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { ReleaseStockCommand } from '../../src/contracts/inventory/release-stock.command.js';
import { ReserveStockCommand } from '../../src/contracts/inventory/reserve-stock.command.js';
import { insertBook, insertStock, stockOf } from '../support/builders.js';
import { resetDatabase, slowDownStockUpdates } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

type Line = { isbn: string; quantity: number };

// Cada actualización de stock tarda 40 ms: así dos pedidos que toquen los libros en orden distinto se cruzan siempre
// y, si el código no bloqueara en el mismo orden, PostgreSQL detectaría el interbloqueo y abortaría uno
const UPDATE_DELAY_MS = 40;

describe('stock.handlers: reservar y liberar a la vez sin interbloqueo (PostgreSQL real)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let removeDelay: (() => Promise<void>) | undefined;

  beforeAll(async () => {
    app = await createTestApp(InventoryModule);
    commandBus = app.get(CommandBus);
  });
  afterAll(async () => {
    await removeDelay?.();
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    removeDelay = await slowDownStockUpdates(UPDATE_DELAY_MS);
  });
  afterEach(async () => {
    await removeDelay?.();
    removeDelay = undefined;
  });

  const reserve = (orderId: string, lines: Line[]) =>
    commandBus.execute(new ReserveStockCommand(orderId, lines));
  const release = (orderId: string) =>
    commandBus.execute(new ReleaseStockCommand(orderId));

  // Dos libros A < B (en orden de ISBN) con stock de sobra
  const twoBooks = async () => {
    const [a, b] = await Promise.all([insertBook(), insertBook()]);
    const [first, second] = [a.isbn, b.isbn].sort();
    await insertStock(first, 100);
    await insertStock(second, 100);
    return { A: first, B: second };
  };

  const allFulfilled = (results: PromiseSettledResult<unknown>[]) =>
    results.map((r) => (r.status === 'rejected' ? String(r.reason) : 'ok'));

  it('dos pedidos con los mismos libros en orden inverso reservan a la vez', async () => {
    const { A, B } = await twoBooks();

    const results = await Promise.allSettled([
      reserve(randomUUID(), [
        { isbn: A, quantity: 1 },
        { isbn: B, quantity: 1 },
      ]),
      reserve(randomUUID(), [
        { isbn: B, quantity: 1 },
        { isbn: A, quantity: 1 },
      ]),
    ]);

    expect(allFulfilled(results)).toEqual(['ok', 'ok']);
    expect(await stockOf(A)).toEqual({ available: 98, reserved: 2 });
    expect(await stockOf(B)).toEqual({ available: 98, reserved: 2 });
  });

  it('varias rondas con muchos pedidos cruzados terminan todas sin error', async () => {
    const { A, B } = await twoBooks();

    for (let round = 0; round < 3; round++) {
      const orders = Array.from({ length: 6 }, (_, i) => ({
        id: randomUUID(),
        // la mitad toca A y luego B; la otra mitad, B y luego A
        lines:
          i % 2 === 0
            ? [
                { isbn: A, quantity: 1 },
                { isbn: B, quantity: 1 },
              ]
            : [
                { isbn: B, quantity: 1 },
                { isbn: A, quantity: 1 },
              ],
      }));

      const results = await Promise.allSettled(
        orders.map((o) => reserve(o.id, o.lines)),
      );

      expect(allFulfilled(results), `ronda ${round + 1}`).toEqual(
        Array(6).fill('ok'),
      );
    }
    // 3 rondas × 6 pedidos × 1 unidad de cada libro
    expect(await stockOf(A)).toEqual({ available: 82, reserved: 18 });
    expect(await stockOf(B)).toEqual({ available: 82, reserved: 18 });
  });

  it('dos pedidos en orden inverso liberan a la vez', async () => {
    const { A, B } = await twoBooks();
    const x = randomUUID();
    const y = randomUUID();
    await reserve(x, [
      { isbn: A, quantity: 2 },
      { isbn: B, quantity: 2 },
    ]);
    await reserve(y, [
      { isbn: B, quantity: 3 },
      { isbn: A, quantity: 3 },
    ]);

    const results = await Promise.allSettled([release(x), release(y)]);

    expect(allFulfilled(results)).toEqual(['ok', 'ok']);
    expect(await stockOf(A)).toEqual({ available: 100, reserved: 0 });
    expect(await stockOf(B)).toEqual({ available: 100, reserved: 0 });
  });

  it('reservar un pedido y liberar otro a la vez, con los libros en orden inverso', async () => {
    const { A, B } = await twoBooks();
    const viejo = randomUUID();
    await reserve(viejo, [
      { isbn: A, quantity: 5 },
      { isbn: B, quantity: 5 },
    ]);

    const results = await Promise.allSettled([
      release(viejo),
      reserve(randomUUID(), [
        { isbn: B, quantity: 1 },
        { isbn: A, quantity: 1 },
      ]),
    ]);

    expect(allFulfilled(results)).toEqual(['ok', 'ok']);
    expect(await stockOf(A)).toEqual({ available: 99, reserved: 1 });
    expect(await stockOf(B)).toEqual({ available: 99, reserved: 1 });
  });

  it('el stock total se conserva: disponible + reservado no cambia después de reservar y liberar a la vez', async () => {
    const { A, B } = await twoBooks();
    const ids = Array.from({ length: 6 }, () => randomUUID());
    for (const id of ids)
      await reserve(id, [
        { isbn: A, quantity: 2 },
        { isbn: B, quantity: 2 },
      ]);

    await Promise.allSettled([
      ...ids.slice(0, 3).map((id) => release(id)),
      ...Array.from({ length: 3 }, () =>
        reserve(randomUUID(), [
          { isbn: B, quantity: 1 },
          { isbn: A, quantity: 1 },
        ]),
      ),
    ]);

    for (const isbn of [A, B]) {
      const stock = await stockOf(isbn);
      expect(stock!.available + stock!.reserved).toBe(100);
      expect(stock!.available).toBeGreaterThanOrEqual(0);
      expect(stock!.reserved).toBeGreaterThanOrEqual(0);
    }
  });
});
