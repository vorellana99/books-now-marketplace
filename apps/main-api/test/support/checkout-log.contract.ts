import { randomUUID } from 'node:crypto';
import {
  RECOVERY_BATCH,
  type CheckoutLog,
  type CheckoutStatus,
} from '../../src/contexts/sales/domain/ports/checkout-log.port.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';

// Lo que cada implementación aporta además del puerto, para preparar y mirar el estado sin pasar por el puerto
export interface CheckoutLogSubject {
  log: CheckoutLog;
  complete(orderId: string, charged: Money): Promise<void>; // lo que hace el repositorio de pedidos al guardar
  backdate(orderId: string, minutes: number): Promise<void>; // envejece el checkout
  expireLock(orderId: string): Promise<void>; // vence el bloqueo de la recuperación
  statusOf(orderId: string): Promise<CheckoutStatus | undefined>;
}

// La misma batería para el fake en memoria y para la implementación con Prisma: así el fake con el que se prueba la
// saga no se desvía de lo real. Cada test pide un sujeto nuevo
export function checkoutLogContract(
  name: string,
  create: () => Promise<CheckoutLogSubject>,
): void {
  describe(`CheckoutLog: contrato (${name})`, () => {
    const start = (
      s: CheckoutLogSubject,
      key = randomUUID(),
      hash = 'hash-1',
    ) => {
      const orderId = randomUUID();
      return s.log
        .start(orderId, key, hash)
        .then((ok) => ({ ok, orderId, key }));
    };

    describe('start y findByKey', () => {
      it('start devuelve true la primera vez y false si la clave ya existe', async () => {
        const s = await create();
        const key = randomUUID();

        expect(await s.log.start(randomUUID(), key, 'h')).toBe(true);
        expect(await s.log.start(randomUUID(), key, 'h')).toBe(false);
      });

      it('claves distintas conviven', async () => {
        const s = await create();
        expect((await start(s)).ok).toBe(true);
        expect((await start(s)).ok).toBe(true);
      });

      it('una clave que no existe da null', async () => {
        const s = await create();
        expect(await s.log.findByKey(randomUUID())).toBeNull();
      });

      it('un checkout recién iniciado está PENDING, con su huella y sin monto', async () => {
        const s = await create();
        const { orderId, key } = await start(s, randomUUID(), 'huella-abc');

        expect(await s.log.findByKey(key)).toEqual({
          orderId,
          status: 'PENDING',
          requestHash: 'huella-abc',
          charged: null,
        });
      });

      it('la clave repetida no pisa al checkout original', async () => {
        const s = await create();
        const key = randomUUID();
        const first = randomUUID();
        await s.log.start(first, key, 'original');
        await s.log.start(randomUUID(), key, 'otro');

        expect(await s.log.findByKey(key)).toMatchObject({
          orderId: first,
          requestHash: 'original',
        });
      });
    });

    describe('al completarse', () => {
      it('queda COMPLETED con el monto y la moneda cobrados', async () => {
        const s = await create();
        const { orderId, key } = await start(s);

        await s.complete(orderId, Money.of('90.00'));

        const record = await s.log.findByKey(key);
        expect(record?.status).toBe('COMPLETED');
        expect(record?.charged?.toJSON()).toEqual({
          amount: '90.00',
          currency: 'PEN',
        });
        expect(await s.log.isCompleted(orderId)).toBe(true);
      });

      it('conserva la moneda: un cobro en dólares se lee en dólares', async () => {
        const s = await create();
        const { orderId, key } = await start(s);

        await s.complete(orderId, Money.of('23.50', 'USD'));

        expect((await s.log.findByKey(key))?.charged?.toJSON()).toEqual({
          amount: '23.50',
          currency: 'USD',
        });
      });
    });

    describe('isCompleted', () => {
      it('es false para un checkout PENDING, para uno ABORTED y para uno que no existe', async () => {
        const s = await create();
        const pending = await start(s);
        const aborted = await start(s);
        await s.log.abort(aborted.orderId);

        expect(await s.log.isCompleted(pending.orderId)).toBe(false);
        expect(await s.log.isCompleted(aborted.orderId)).toBe(false);
        expect(await s.log.isCompleted(randomUUID())).toBe(false);
      });
    });

    describe('abort', () => {
      it('pasa PENDING a ABORTED', async () => {
        const s = await create();
        const { orderId, key } = await start(s);

        await s.log.abort(orderId);

        expect((await s.log.findByKey(key))?.status).toBe('ABORTED');
      });

      it('nunca toca un COMPLETED', async () => {
        const s = await create();
        const { orderId } = await start(s);
        await s.complete(orderId, Money.of('10.00'));

        await s.log.abort(orderId);

        expect(await s.statusOf(orderId)).toBe('COMPLETED');
      });

      it('sobre uno que no existe, o ya ABORTED, no hace nada ni falla', async () => {
        const s = await create();
        const { orderId } = await start(s);
        await s.log.abort(orderId);

        await expect(s.log.abort(orderId)).resolves.toBeUndefined();
        await expect(s.log.abort(randomUUID())).resolves.toBeUndefined();
        expect(await s.statusOf(orderId)).toBe('ABORTED');
      });
    });

    describe('purgeFinished (retención)', () => {
      const DAY = 24 * 60; // minutos

      // Un checkout con el estado y la antigüedad (en días) indicados
      async function checkout(
        s: CheckoutLogSubject,
        status: 'PENDING' | 'COMPLETED' | 'ABORTED',
        ageDays: number,
      ) {
        const made = await start(s);
        if (status === 'COMPLETED')
          await s.complete(made.orderId, Money.of('10.00'));
        if (status === 'ABORTED') await s.log.abort(made.orderId);
        await s.backdate(made.orderId, ageDays * DAY);
        return made;
      }

      it('borra los COMPLETED y los ABORTED más viejos que el plazo y devuelve cuántos', async () => {
        const s = await create();
        const done = await checkout(s, 'COMPLETED', 31);
        const aborted = await checkout(s, 'ABORTED', 31);

        expect(await s.log.purgeFinished(30, 100)).toBe(2);

        expect(await s.statusOf(done.orderId)).toBeUndefined();
        expect(await s.statusOf(aborted.orderId)).toBeUndefined();
      });

      it('nunca borra un PENDING, por viejo que sea: la recuperación lo necesita', async () => {
        const s = await create();
        const stuck = await checkout(s, 'PENDING', 400);

        expect(await s.log.purgeFinished(30, 100)).toBe(0);

        expect(await s.statusOf(stuck.orderId)).toBe('PENDING');
      });

      it('no borra los recientes, ni uno justo dentro del plazo', async () => {
        const s = await create();
        const fresh = await checkout(s, 'COMPLETED', 1);
        const edge = await checkout(s, 'ABORTED', 29);

        expect(await s.log.purgeFinished(30, 100)).toBe(0);

        expect(await s.statusOf(fresh.orderId)).toBe('COMPLETED');
        expect(await s.statusOf(edge.orderId)).toBe('ABORTED');
      });

      it('el plazo es el que se pide: con 7 días, uno de 8 se borra y uno de 6 no', async () => {
        const s = await create();
        const old = await checkout(s, 'COMPLETED', 8);
        const recent = await checkout(s, 'COMPLETED', 6);

        expect(await s.log.purgeFinished(7, 100)).toBe(1);

        expect(await s.statusOf(old.orderId)).toBeUndefined();
        expect(await s.statusOf(recent.orderId)).toBe('COMPLETED');
      });

      it('borra como mucho `limit` por llamada, y el resto en la siguiente', async () => {
        const s = await create();
        for (let i = 0; i < 5; i++) await checkout(s, 'COMPLETED', 40);

        expect(await s.log.purgeFinished(30, 2)).toBe(2);
        expect(await s.log.purgeFinished(30, 2)).toBe(2);
        expect(await s.log.purgeFinished(30, 2)).toBe(1);
        expect(await s.log.purgeFinished(30, 2)).toBe(0);
      });

      it('borra primero los más antiguos', async () => {
        const s = await create();
        const oldest = await checkout(s, 'COMPLETED', 90);
        const older = await checkout(s, 'COMPLETED', 60);
        const old = await checkout(s, 'COMPLETED', 40);

        await s.log.purgeFinished(30, 1);

        expect(await s.statusOf(oldest.orderId)).toBeUndefined();
        expect(await s.statusOf(older.orderId)).toBe('COMPLETED');
        expect(await s.statusOf(old.orderId)).toBe('COMPLETED');
      });

      it('tras borrarlo, su Idempotency-Key se olvida: la clave sirve de nuevo', async () => {
        const s = await create();
        const made = await checkout(s, 'COMPLETED', 31);

        await s.log.purgeFinished(30, 100);

        expect(await s.log.findByKey(made.key)).toBeNull();
        expect(await s.log.start(randomUUID(), made.key, 'hash-1')).toBe(true);
      });
    });

    describe('claimStale (recuperación de checkouts a medias)', () => {
      it('reclama solo los PENDING con más de N minutos', async () => {
        const s = await create();
        const old = await start(s);
        const fresh = await start(s);
        await s.backdate(old.orderId, 11);
        await s.backdate(fresh.orderId, 2);

        const claimed = await s.log.claimStale(10);

        expect(claimed.map((c) => c.orderId)).toEqual([old.orderId]);
      });

      it('no reclama los COMPLETED ni los ABORTED, por viejos que sean', async () => {
        const s = await create();
        const completed = await start(s);
        const aborted = await start(s);
        await s.complete(completed.orderId, Money.of('10.00'));
        await s.log.abort(aborted.orderId);
        await s.backdate(completed.orderId, 60);
        await s.backdate(aborted.orderId, 60);

        expect(await s.log.claimStale(10)).toEqual([]);
      });

      it('devuelve el requestId de la compra original, o null si no había', async () => {
        const s = await create();
        const withId = randomUUID();
        const without = randomUUID();
        await RequestContext.run('r-original', () =>
          s.log.start(withId, randomUUID(), 'h'),
        );
        await s.log.start(without, randomUUID(), 'h');
        await s.backdate(withId, 11);
        await s.backdate(without, 11);

        const claimed = await s.log.claimStale(10);

        expect(claimed.find((c) => c.orderId === withId)?.requestId).toBe(
          'r-original',
        );
        expect(
          claimed.find((c) => c.orderId === without)?.requestId,
        ).toBeNull();
      });

      it('lo reclamado queda bloqueado: otra vuelta no lo vuelve a tomar hasta que venza el bloqueo', async () => {
        const s = await create();
        const { orderId } = await start(s);
        await s.backdate(orderId, 11);

        expect(await s.log.claimStale(10)).toHaveLength(1);
        expect(await s.log.claimStale(10)).toHaveLength(0);

        await s.expireLock(orderId);
        expect(await s.log.claimStale(10)).toHaveLength(1);
      });

      it(`toma como mucho ${RECOVERY_BATCH} por vuelta y el resto en la siguiente`, async () => {
        const s = await create();
        const ids: string[] = [];
        for (let i = 0; i < RECOVERY_BATCH + 2; i++) {
          const { orderId } = await start(s);
          await s.backdate(orderId, 11);
          ids.push(orderId);
        }

        const first = await s.log.claimStale(10);
        const second = await s.log.claimStale(10);

        expect(first).toHaveLength(RECOVERY_BATCH);
        expect(second).toHaveLength(2);
        expect(new Set([...first, ...second].map((c) => c.orderId))).toEqual(
          new Set(ids),
        );
      });

      it('cuando hay más de un lote, recupera primero los más antiguos', async () => {
        const s = await create();
        const byAge: string[] = [];
        // los que se crean primero son los MÁS NUEVOS: el orden de creación no coincide con la antigüedad
        for (let i = 0; i < RECOVERY_BATCH + 2; i++) {
          const { orderId } = await start(s);
          await s.backdate(orderId, 11 + i);
          byAge.unshift(orderId); // el último creado es el más viejo
        }

        const first = await s.log.claimStale(10);

        // importa cuáles se reclaman (los más antiguos), no el orden en que se devuelven
        expect(new Set(first.map((c) => c.orderId))).toEqual(
          new Set(byAge.slice(0, RECOVERY_BATCH)),
        );
      });

      it('un checkout reclamado sigue PENDING: recuperarlo no lo marca ABORTED por sí solo', async () => {
        const s = await create();
        const { orderId } = await start(s);
        await s.backdate(orderId, 11);

        await s.log.claimStale(10);

        expect(await s.statusOf(orderId)).toBe('PENDING');
      });
    });
  });
}
