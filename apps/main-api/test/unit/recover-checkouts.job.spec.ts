import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { RecoverCheckoutsJob } from '../../src/contexts/sales/application/order/recover-checkouts.job.js';
import { CheckoutLog } from '../../src/contexts/sales/domain/order/checkout-log.port.js';
import { StockReservation } from '../../src/contexts/sales/domain/order/stock-reservation.port.js';
import { PaymentGateway } from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { FakePaymentGateway } from '../fakes/fake-payment-gateway.js';
import { FakeStockReservation } from '../fakes/fake-stock-reservation.js';
import { InMemoryCheckoutLog } from '../fakes/in-memory-checkout-log.js';

const MIN = 10;
const config = (minutes?: number) =>
  new ConfigService(
    minutes === undefined ? {} : { CHECKOUT_RECOVERY_MINUTES: minutes },
  );

// Un checkout que quedó a medias hace `age` minutos: con reserva y, si `charged`, también con cobro hecho
async function stuck(
  checkouts: InMemoryCheckoutLog,
  payments: FakePaymentGateway,
  stock: FakeStockReservation,
  options: {
    orderId: string;
    age?: number;
    charged?: boolean;
    requestId?: string;
  },
) {
  await RequestContext.run(options.requestId ?? 'r-original', () =>
    checkouts.start(options.orderId, `key-${options.orderId}`, 'h'),
  );
  await stock.reserve(options.orderId, [
    { isbn: '9780306406157', quantity: 1 },
  ]);
  if (options.charged !== false) {
    await payments.charge(Money.of('90.00'), 'tok', options.orderId);
  }
  checkouts.backdate(options.orderId, options.age ?? MIN + 1);
}

function setup(minutes = MIN) {
  const checkouts = new InMemoryCheckoutLog();
  const payments = new FakePaymentGateway();
  const stock = new FakeStockReservation();
  const job = new RecoverCheckoutsJob(
    checkouts,
    payments,
    stock,
    config(minutes),
  );
  return { checkouts, payments, stock, job };
}

describe('RecoverCheckoutsJob', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  describe('una compra que se cayó después de cobrar', () => {
    it('reembolsa, libera la reserva y anula el checkout', async () => {
      const { checkouts, payments, stock, job } = setup();
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });

      const processed = await job.run();

      expect(processed).toBe(1);
      expect(payments.refunded).toEqual(['o-1']);
      expect(stock.released).toEqual(['o-1']);
      expect(checkouts.statusOf('o-1')).toBe('ABORTED');
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('o-1');
    });

    it('si solo reservó (no llegó a cobrar), libera y anula; el reembolso no hace nada', async () => {
      const { checkouts, payments, stock, job } = setup();
      await stuck(checkouts, payments, stock, {
        orderId: 'o-1',
        charged: false,
      });

      await job.run();

      expect(payments.refunded).toEqual([]);
      expect(stock.released).toEqual(['o-1']);
      expect(checkouts.statusOf('o-1')).toBe('ABORTED');
    });

    it('el orden es reembolsar, liberar y por último anular', async () => {
      const calls: string[] = [];
      const checkouts = new InMemoryCheckoutLog();
      const abort = checkouts.abort.bind(checkouts);
      checkouts.abort = (id) => (calls.push('abort'), abort(id));
      const payments = new FakePaymentGateway();
      payments.refund = () => (calls.push('refund'), Promise.resolve());
      const stock = new FakeStockReservation();
      stock.release = () => (calls.push('release'), Promise.resolve());
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });

      await job.run();

      expect(calls).toEqual(['refund', 'release', 'abort']);
    });
  });

  describe('lo que no debe tocar', () => {
    it('un checkout COMPLETED, por viejo que sea', async () => {
      const { checkouts, payments, stock, job } = setup();
      await stuck(checkouts, payments, stock, { orderId: 'o-1', age: 600 });
      checkouts.complete('o-1', Money.of('90.00'));

      expect(await job.run()).toBe(0);

      expect(payments.refunded).toEqual([]);
      expect(stock.released).toEqual([]);
      expect(checkouts.statusOf('o-1')).toBe('COMPLETED');
    });

    it('un checkout reciente: la compra puede seguir en curso', async () => {
      const { checkouts, payments, stock, job } = setup();
      await stuck(checkouts, payments, stock, { orderId: 'o-1', age: MIN - 2 });

      expect(await job.run()).toBe(0);

      expect(payments.refunded).toEqual([]);
      expect(checkouts.statusOf('o-1')).toBe('PENDING');
    });

    it('un checkout ya ANULADO', async () => {
      const { checkouts, payments, stock, job } = setup();
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });
      await checkouts.abort('o-1');

      expect(await job.run()).toBe(0);
      expect(payments.refunded).toEqual([]);
    });

    it('si la compra se completó justo después de reclamarse, no reembolsa ni libera', async () => {
      const { checkouts, payments, stock } = setup();
      const claim = checkouts.claimStale.bind(checkouts);
      checkouts.claimStale = async (minutes) => {
        const claimed = await claim(minutes);
        for (const c of claimed)
          checkouts.complete(c.orderId, Money.of('90.00'));
        return claimed;
      };
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });

      await job.run();

      expect(payments.refunded).toEqual([]);
      expect(stock.released).toEqual([]);
      expect(checkouts.statusOf('o-1')).toBe('COMPLETED');
    });
  });

  describe('si una compensación falla', () => {
    it('el reembolso fallido deja el checkout PENDING, sin liberar, y se registra el error', async () => {
      const checkouts = new InMemoryCheckoutLog();
      const payments = new FakePaymentGateway({ refundFails: true });
      const stock = new FakeStockReservation();
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });

      await expect(job.run()).resolves.toBe(1);

      expect(checkouts.statusOf('o-1')).toBe('PENDING');
      expect(stock.released).toEqual([]);
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).toContain('o-1');
      expect(warn).not.toHaveBeenCalled();
    });

    it('la liberación fallida también lo deja PENDING', async () => {
      const checkouts = new InMemoryCheckoutLog();
      const payments = new FakePaymentGateway();
      const stock = new FakeStockReservation({ releaseFails: true });
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });

      await job.run();

      expect(checkouts.statusOf('o-1')).toBe('PENDING');
      expect(payments.refunded).toEqual(['o-1']);
    });

    it('se reintenta en una vuelta posterior, cuando vence el bloqueo, y entonces termina', async () => {
      const checkouts = new InMemoryCheckoutLog();
      let failing = true;
      const payments = new FakePaymentGateway();
      const refund = payments.refund.bind(payments);
      payments.refund = (id) =>
        failing ? Promise.reject(new Error('caída')) : refund(id);
      const stock = new FakeStockReservation();
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      await stuck(checkouts, payments, stock, { orderId: 'o-1' });

      await job.run();
      expect(await job.run()).toBe(0); // sigue bloqueado por la vuelta anterior
      failing = false;
      checkouts.expireLock('o-1');
      expect(await job.run()).toBe(1);

      expect(payments.refunded).toEqual(['o-1']);
      expect(stock.released).toEqual(['o-1']);
      expect(checkouts.statusOf('o-1')).toBe('ABORTED');
    });

    it('un checkout que falla no impide recuperar los demás', async () => {
      const checkouts = new InMemoryCheckoutLog();
      const payments = new FakePaymentGateway();
      const refund = payments.refund.bind(payments);
      payments.refund = (id) =>
        id === 'o-1' ? Promise.reject(new Error('caída')) : refund(id);
      const stock = new FakeStockReservation();
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      await stuck(checkouts, payments, stock, { orderId: 'o-1', age: 30 });
      await stuck(checkouts, payments, stock, { orderId: 'o-2', age: 20 });
      await stuck(checkouts, payments, stock, { orderId: 'o-3', age: 15 });

      expect(await job.run()).toBe(3);

      expect(checkouts.statusOf('o-1')).toBe('PENDING');
      expect(checkouts.statusOf('o-2')).toBe('ABORTED');
      expect(checkouts.statusOf('o-3')).toBe('ABORTED');
    });

    it('si no se puede ni consultar los checkouts, el error sube (el planificador lo registra)', async () => {
      const { checkouts, job } = setup();
      checkouts.claimStale = () => Promise.reject(new Error('base caída'));
      await expect(job.run()).rejects.toThrow('base caída');
    });
  });

  describe('umbral de antigüedad', () => {
    const claimedWith = async (cfg: ConfigService) => {
      const checkouts = new InMemoryCheckoutLog();
      const spy = vi.spyOn(checkouts, 'claimStale');
      await new RecoverCheckoutsJob(
        checkouts,
        new FakePaymentGateway(),
        new FakeStockReservation(),
        cfg,
      ).run();
      return spy.mock.calls[0][0];
    };

    it('usa CHECKOUT_RECOVERY_MINUTES', async () => {
      expect(await claimedWith(config(25))).toBe(25);
    });

    it('sin la variable, 10 minutos', async () => {
      expect(await claimedWith(config())).toBe(10);
    });
  });

  describe('el requestId de la compra original', () => {
    const seen = async (requestId: string | undefined) => {
      const checkouts = new InMemoryCheckoutLog();
      const ids: (string | undefined)[] = [];
      const payments = new FakePaymentGateway();
      payments.refund = () => (
        ids.push(RequestContext.requestId()),
        Promise.resolve()
      );
      const stock = new FakeStockReservation();
      stock.release = () => (
        ids.push(RequestContext.requestId()),
        Promise.resolve()
      );
      const job = new RecoverCheckoutsJob(checkouts, payments, stock, config());
      if (requestId) {
        await stuck(checkouts, payments, stock, { orderId: 'o-1', requestId });
      } else {
        await checkouts.start('o-1', 'k', 'h'); // sin RequestContext: requestId null
        checkouts.backdate('o-1', MIN + 1);
      }
      await job.run();
      return ids;
    };

    it('las compensaciones corren con el mismo requestId que la compra', async () => {
      expect(await seen('r-7f3a')).toEqual(['r-7f3a', 'r-7f3a']);
    });

    it('si la compra no tenía requestId, usa recovery-<orderId>', async () => {
      expect(await seen(undefined)).toEqual(['recovery-o-1', 'recovery-o-1']);
    });

    it('el requestId no se filtra a la siguiente tarea', async () => {
      await seen('r-7f3a');
      expect(RequestContext.requestId()).toBeUndefined();
    });
  });

  describe('planificación', () => {
    it('queda registrado como tarea cron cada 5 minutos', async () => {
      const module = await Test.createTestingModule({
        imports: [ScheduleModule.forRoot()],
        providers: [
          RecoverCheckoutsJob,
          { provide: CheckoutLog, useValue: new InMemoryCheckoutLog() },
          { provide: PaymentGateway, useValue: new FakePaymentGateway() },
          { provide: StockReservation, useValue: new FakeStockReservation() },
          { provide: ConfigService, useValue: config() },
        ],
      }).compile();
      const app = module.createNestApplication();
      await app.init();
      try {
        const jobs = [...app.get(SchedulerRegistry).getCronJobs().values()];
        expect(jobs).toHaveLength(1);
        expect(String(jobs[0].cronTime.source)).toBe('0 */5 * * * *');
      } finally {
        await app.close();
      }
    });
  });
});
