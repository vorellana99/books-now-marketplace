import { randomUUID } from 'node:crypto';
import type { StockRepository } from '../../src/contexts/inventory/domain/ports/stock.repository.js';
import {
  MAX_AVAILABLE,
  type StockLevel,
} from '../../src/contexts/inventory/domain/stock/stock-rules.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import type { TransactionHandle } from '../../src/shared-kernel/transaction-handle.js';

export interface ReservationRow {
  isbn: string;
  quantity: number;
  status: string;
}

// Lo que cada implementación aporta además del puerto, para preparar y mirar el estado sin pasar por él
export interface StockRepositorySubject {
  repo: StockRepository;
  seed(isbn: string, available: number, reserved?: number): Promise<void>;
  levelOf(
    isbn: string,
  ): Promise<{ available: number; reserved: number } | undefined>;
  reservationsOf(orderId: string): Promise<ReservationRow[]>;
  ageReservations(orderId: string, days: number): Promise<void>; // envejece las reservas del pedido
  // Ejecuta `fn` dentro de una transacción abierta por otro (como el relay del Outbox); si `fn` falla, se deshace todo
  withTransaction(fn: (tx: TransactionHandle) => Promise<void>): Promise<void>;
  // Ensancha la ventana en la que dos transacciones se cruzarían (solo la base real lo necesita); devuelve cómo quitarlo
  widenRaceWindow?(): Promise<() => Promise<void>>;
}

const DAY = 86_400_000;
const isbn = (n: number) => `97800000${String(n).padStart(5, '0')}`;
const A = isbn(1);
const B = isbn(2);
const C = isbn(3);

// La misma batería para el fake en memoria y para el adaptador de Prisma: así el fake con el que se prueban los casos de
// uso no se desvía de lo real. Cada test pide un sujeto nuevo
export function stockRepositoryContract(
  name: string,
  create: () => Promise<StockRepositorySubject>,
): void {
  describe(`StockRepository: contrato (${name})`, () => {
    const order = () => randomUUID();
    const error = (p: Promise<unknown>) =>
      p.then(
        () => undefined,
        (e: unknown) => e,
      );

    describe('reserve', () => {
      it('descuenta lo disponible, suma lo reservado y deja una reserva HELD por línea', async () => {
        const s = await create();
        await s.seed(A, 10);
        await s.seed(B, 5);
        const id = order();

        await s.repo.reserve(id, [
          { isbn: A, quantity: 3 },
          { isbn: B, quantity: 5 },
        ]);

        expect(await s.levelOf(A)).toEqual({ available: 7, reserved: 3 });
        expect(await s.levelOf(B)).toEqual({ available: 0, reserved: 5 });
        expect(await s.reservationsOf(id)).toEqual([
          { isbn: A, quantity: 3, status: 'HELD' },
          { isbn: B, quantity: 5, status: 'HELD' },
        ]);
      });

      it('si un libro no alcanza: OutOfStockError, y no se reserva NADA (ni de los demás libros)', async () => {
        const s = await create();
        await s.seed(A, 10);
        await s.seed(B, 1);
        const id = order();

        const failed = await error(
          s.repo.reserve(id, [
            { isbn: A, quantity: 2 },
            { isbn: B, quantity: 2 },
          ]),
        );

        expect(failed).toBeInstanceOf(OutOfStockError);
        expect((failed as DomainError).code).toBe('OUT_OF_STOCK');
        expect(await s.levelOf(A)).toEqual({ available: 10, reserved: 0 });
        expect(await s.levelOf(B)).toEqual({ available: 1, reserved: 0 });
        expect(await s.reservationsOf(id)).toEqual([]);
      });

      it('justo lo que hay se puede reservar; una unidad más, no', async () => {
        const s = await create();
        await s.seed(A, 4);

        await s.repo.reserve(order(), [{ isbn: A, quantity: 4 }]);
        const failed = await error(
          s.repo.reserve(order(), [{ isbn: A, quantity: 1 }]),
        );

        expect(failed).toBeInstanceOf(OutOfStockError);
        expect(await s.levelOf(A)).toEqual({ available: 0, reserved: 4 });
      });

      it('un libro sin registro de stock es StockItemNotFoundError, y no se reserva nada', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();

        const failed = await error(
          s.repo.reserve(id, [
            { isbn: A, quantity: 1 },
            { isbn: C, quantity: 1 },
          ]),
        );

        expect(failed).toBeInstanceOf(StockItemNotFoundError);
        expect(await s.levelOf(A)).toEqual({ available: 10, reserved: 0 });
        expect(await s.reservationsOf(id)).toEqual([]);
      });

      it('un pedido que ya tiene reservas es ConflictError ORDER_ALREADY_RESERVED y no descuenta otra vez', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 2 }]);

        const failed = await error(
          s.repo.reserve(id, [{ isbn: A, quantity: 2 }]),
        );

        expect(failed).toBeInstanceOf(ConflictError);
        expect((failed as ConflictError).code).toBe('ORDER_ALREADY_RESERVED');
        expect(await s.levelOf(A)).toEqual({ available: 8, reserved: 2 });
      });
    });

    describe('release', () => {
      it('devuelve el stock de las reservas HELD y las borra', async () => {
        const s = await create();
        await s.seed(A, 10);
        await s.seed(B, 10);
        const id = order();
        await s.repo.reserve(id, [
          { isbn: A, quantity: 3 },
          { isbn: B, quantity: 4 },
        ]);

        await s.repo.release(id);

        expect(await s.levelOf(A)).toEqual({ available: 10, reserved: 0 });
        expect(await s.levelOf(B)).toEqual({ available: 10, reserved: 0 });
        expect(await s.reservationsOf(id)).toEqual([]);
      });

      it('es idempotente: liberar otra vez, o un pedido sin reservas, no hace nada ni devuelve stock de más', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 3 }]);

        await s.repo.release(id);
        await s.repo.release(id);
        await s.repo.release(order());

        expect(await s.levelOf(A)).toEqual({ available: 10, reserved: 0 });
      });

      it('una reserva CONFIRMED es definitiva: no se libera', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 3 }]);
        await s.repo.confirm(id);

        await s.repo.release(id);

        expect(await s.levelOf(A)).toEqual({ available: 7, reserved: 3 });
        expect(await s.reservationsOf(id)).toEqual([
          { isbn: A, quantity: 3, status: 'CONFIRMED' },
        ]);
      });

      it('no toca las reservas de otros pedidos', async () => {
        const s = await create();
        await s.seed(A, 10);
        const [one, two] = [order(), order()];
        await s.repo.reserve(one, [{ isbn: A, quantity: 2 }]);
        await s.repo.reserve(two, [{ isbn: A, quantity: 3 }]);

        await s.repo.release(one);

        expect(await s.levelOf(A)).toEqual({ available: 7, reserved: 3 });
        expect(await s.reservationsOf(two)).toHaveLength(1);
      });
    });

    describe('confirm', () => {
      it('pasa las reservas HELD del pedido a CONFIRMED sin cambiar las cantidades', async () => {
        const s = await create();
        await s.seed(A, 10);
        await s.seed(B, 10);
        const id = order();
        await s.repo.reserve(id, [
          { isbn: A, quantity: 1 },
          { isbn: B, quantity: 2 },
        ]);

        await s.repo.confirm(id);

        expect((await s.reservationsOf(id)).map((r) => r.status)).toEqual([
          'CONFIRMED',
          'CONFIRMED',
        ]);
        expect(await s.levelOf(A)).toEqual({ available: 9, reserved: 1 });
      });

      it('repetirlo, o confirmar un pedido sin reservas, no hace daño', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 1 }]);

        await s.repo.confirm(id);
        await s.repo.confirm(id);
        await s.repo.confirm(order());

        expect(await s.reservationsOf(id)).toEqual([
          { isbn: A, quantity: 1, status: 'CONFIRMED' },
        ]);
      });

      it('solo toca el pedido indicado', async () => {
        const s = await create();
        await s.seed(A, 10);
        const [one, two] = [order(), order()];
        await s.repo.reserve(one, [{ isbn: A, quantity: 1 }]);
        await s.repo.reserve(two, [{ isbn: A, quantity: 1 }]);

        await s.repo.confirm(one);

        expect((await s.reservationsOf(two))[0]?.status).toBe('HELD');
      });

      it('dentro de la transacción de otro: se confirma con ella, y si esa falla, se deshace', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 1 }]);

        await s
          .withTransaction(async (tx) => {
            await s.repo.confirm(id, tx);
            throw new Error('la transacción del relay falló');
          })
          .catch(() => undefined);

        expect((await s.reservationsOf(id))[0]?.status).toBe('HELD');
      });

      it('dentro de la transacción de otro que termina bien: queda confirmada', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 1 }]);

        await s.withTransaction((tx) => s.repo.confirm(id, tx));

        expect((await s.reservationsOf(id))[0]?.status).toBe('CONFIRMED');
      });
    });

    describe('add', () => {
      it('suma al stock y devuelve el nivel resultante, sin tocar lo reservado', async () => {
        const s = await create();
        await s.seed(A, 10, 4);

        const level: StockLevel = await s.repo.add(A, 25);

        expect(level).toEqual({ isbn: A, available: 35, reserved: 4 });
        expect(await s.levelOf(A)).toEqual({ available: 35, reserved: 4 });
      });

      it('un libro sin registro de stock es StockItemNotFoundError', async () => {
        const s = await create();

        expect(await error(s.repo.add(C, 5))).toBeInstanceOf(
          StockItemNotFoundError,
        );
      });

      it('lo disponible no pasa del máximo: STOCK_LIMIT_EXCEEDED, sin cambios; justo hasta el máximo sí', async () => {
        const s = await create();
        await s.seed(A, MAX_AVAILABLE - 5);

        const failed = await error(s.repo.add(A, 6));
        expect((failed as DomainError).code).toBe('STOCK_LIMIT_EXCEEDED');
        expect(await s.levelOf(A)).toEqual({
          available: MAX_AVAILABLE - 5,
          reserved: 0,
        });

        await expect(s.repo.add(A, 5)).resolves.toMatchObject({
          available: MAX_AVAILABLE,
        });
      });

      it('una carga y una reserva simultáneas no se pisan', async () => {
        const s = await create();
        await s.seed(A, 100);

        await Promise.all([
          s.repo.add(A, 50),
          s.repo.reserve(order(), [{ isbn: A, quantity: 30 }]),
        ]);

        expect(await s.levelOf(A)).toEqual({ available: 120, reserved: 30 });
      });
    });

    describe('createItem', () => {
      it('crea el registro de un libro nuevo, en cero', async () => {
        const s = await create();

        await s.repo.createItem(A);

        expect(await s.levelOf(A)).toEqual({ available: 0, reserved: 0 });
      });

      it('si ya existe no lo toca ni pisa su stock, y repetirlo no falla', async () => {
        const s = await create();
        await s.seed(A, 7, 2);

        await s.repo.createItem(A);
        await s.repo.createItem(A);

        expect(await s.levelOf(A)).toEqual({ available: 7, reserved: 2 });
      });

      it('dentro de la transacción de otro: si esa falla, no queda el registro', async () => {
        const s = await create();

        await s
          .withTransaction(async (tx) => {
            await s.repo.createItem(A, tx);
            throw new Error('la transacción del relay falló');
          })
          .catch(() => undefined);

        expect(await s.levelOf(A)).toBeUndefined();
      });

      it('dentro de la transacción de otro que termina bien: queda el registro', async () => {
        const s = await create();

        await s.withTransaction((tx) => s.repo.createItem(A, tx));

        expect(await s.levelOf(A)).toEqual({ available: 0, reserved: 0 });
      });
    });

    describe('purgeConfirmed (retención)', () => {
      it('borra las reservas CONFIRMED con más de N días y devuelve cuántas; conserva las HELD y las recientes', async () => {
        const s = await create();
        await s.seed(A, 100);
        const [oldConfirmed, oldHeld, recentConfirmed] = [
          order(),
          order(),
          order(),
        ];
        for (const id of [oldConfirmed, oldHeld, recentConfirmed]) {
          await s.repo.reserve(id, [{ isbn: A, quantity: 1 }]);
        }
        await s.repo.confirm(oldConfirmed);
        await s.repo.confirm(recentConfirmed);
        await s.ageReservations(oldConfirmed, 120);
        await s.ageReservations(oldHeld, 120);
        await s.ageReservations(recentConfirmed, 5);

        expect(await s.repo.purgeConfirmed(90, 100)).toBe(1);

        expect(await s.reservationsOf(oldConfirmed)).toEqual([]);
        expect(await s.reservationsOf(oldHeld)).toHaveLength(1);
        expect(await s.reservationsOf(recentConfirmed)).toHaveLength(1);
        expect(await s.levelOf(A)).toEqual({ available: 97, reserved: 3 });
      });

      it('borra como mucho `limit` por llamada', async () => {
        const s = await create();
        await s.seed(A, 100);
        for (let i = 0; i < 5; i++) {
          const id = order();
          await s.repo.reserve(id, [{ isbn: A, quantity: 1 }]);
          await s.repo.confirm(id);
          await s.ageReservations(id, 200);
        }

        expect(await s.repo.purgeConfirmed(90, 2)).toBe(2);
        expect(await s.repo.purgeConfirmed(90, 2)).toBe(2);
        expect(await s.repo.purgeConfirmed(90, 2)).toBe(1);
        expect(await s.repo.purgeConfirmed(90, 2)).toBe(0);
      });

      it('de un pedido con dos libros borra solo la línea que cumple (la clave es pedido + libro)', async () => {
        const s = await create();
        await s.seed(A, 100);
        await s.seed(B, 100);
        const id = order();
        await s.repo.reserve(id, [
          { isbn: A, quantity: 1 },
          { isbn: B, quantity: 1 },
        ]);
        await s.repo.confirm(id);
        await s.ageReservations(id, 200);

        expect(await s.repo.purgeConfirmed(90, 100)).toBe(2);
        expect(await s.reservationsOf(id)).toEqual([]);
        expect(DAY).toBeGreaterThan(0);
      });
    });

    describe('concurrencia (el motivo de que las operaciones sean atómicas)', () => {
      async function widen(s: StockRepositorySubject) {
        return s.widenRaceWindow ? s.widenRaceWindow() : async () => undefined;
      }

      it('muchos pedidos a la vez por pocas unidades: entran tantos como unidades hay y nunca queda negativo', async () => {
        const s = await create();
        await s.seed(A, 5);
        const restore = await widen(s);
        try {
          const results = await Promise.allSettled(
            Array.from({ length: 12 }, () =>
              s.repo.reserve(order(), [{ isbn: A, quantity: 1 }]),
            ),
          );

          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
            5,
          );
          for (const r of results.filter((x) => x.status === 'rejected')) {
            expect((r as PromiseRejectedResult).reason).toBeInstanceOf(
              OutOfStockError,
            );
          }
          expect(await s.levelOf(A)).toEqual({ available: 0, reserved: 5 });
        } finally {
          await restore();
        }
      });

      it('dos pedidos con los mismos libros en orden inverso, a la vez: ninguno se interbloquea y entran los dos', async () => {
        const s = await create();
        await s.seed(A, 10);
        await s.seed(B, 10);
        const restore = await widen(s);
        try {
          const results = await Promise.allSettled([
            s.repo.reserve(order(), [
              { isbn: A, quantity: 1 },
              { isbn: B, quantity: 1 },
            ]),
            s.repo.reserve(order(), [
              { isbn: B, quantity: 1 },
              { isbn: A, quantity: 1 },
            ]),
          ]);

          expect(results.map((r) => r.status)).toEqual([
            'fulfilled',
            'fulfilled',
          ]);
          expect(await s.levelOf(A)).toEqual({ available: 8, reserved: 2 });
          expect(await s.levelOf(B)).toEqual({ available: 8, reserved: 2 });
        } finally {
          await restore();
        }
      });

      it('el mismo pedido reservado dos veces a la vez: una entra y la otra es ORDER_ALREADY_RESERVED, y se descuenta una sola vez', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        const restore = await widen(s);
        try {
          const results = await Promise.allSettled([
            s.repo.reserve(id, [{ isbn: A, quantity: 2 }]),
            s.repo.reserve(id, [{ isbn: A, quantity: 2 }]),
          ]);

          expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(
            1,
          );
          const rejected = results.find(
            (r) => r.status === 'rejected',
          ) as PromiseRejectedResult;
          expect((rejected.reason as ConflictError).code).toBe(
            'ORDER_ALREADY_RESERVED',
          );
          expect(await s.levelOf(A)).toEqual({ available: 8, reserved: 2 });
        } finally {
          await restore();
        }
      });

      it('dos liberaciones del mismo pedido a la vez: el stock vuelve una sola vez', async () => {
        const s = await create();
        await s.seed(A, 10);
        const id = order();
        await s.repo.reserve(id, [{ isbn: A, quantity: 3 }]);
        const restore = await widen(s);
        try {
          await Promise.all([s.repo.release(id), s.repo.release(id)]);

          expect(await s.levelOf(A)).toEqual({ available: 10, reserved: 0 });
        } finally {
          await restore();
        }
      });
    });
  });
}
