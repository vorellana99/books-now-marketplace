import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PurgeCheckoutsJob } from '../../../src/contexts/sales/application/jobs/purge-checkouts.job.js';
import { CheckoutLog } from '../../../src/contexts/sales/domain/ports/checkout-log.port.js';
import { Money } from '../../../src/contexts/sales/domain/shared/money.vo.js';
import { PURGE_BATCH } from '../../../src/platform/retention/purge-in-batches.js';
import { InMemoryCheckoutLog } from '../../fakes/in-memory-checkout-log.js';

const DAY = 24 * 60;
const config = (days?: number) =>
  new ConfigService(
    days === undefined ? {} : { RETENTION_CHECKOUT_DAYS: days },
  );

let counter = 0;
async function finished(
  log: InMemoryCheckoutLog,
  ageDays: number,
  status: 'COMPLETED' | 'ABORTED' | 'PENDING' = 'COMPLETED',
): Promise<string> {
  const orderId = `o-${++counter}`;
  await log.start(orderId, `k-${orderId}`, 'h');
  if (status === 'COMPLETED') log.complete(orderId, Money.of('10.00'));
  if (status === 'ABORTED') await log.abort(orderId);
  log.backdate(orderId, ageDays * DAY);
  return orderId;
}

describe('PurgeCheckoutsJob', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('borra lo terminado que supera RETENTION_CHECKOUT_DAYS y devuelve cuántos', async () => {
    const log = new InMemoryCheckoutLog();
    const old = await finished(log, 31);
    const recent = await finished(log, 2);

    expect(await new PurgeCheckoutsJob(log, config(30)).run()).toBe(1);

    expect(log.statusOf(old)).toBeUndefined();
    expect(log.statusOf(recent)).toBe('COMPLETED');
  });

  it('el plazo sale de la configuración: con 60 días, uno de 31 se queda', async () => {
    const log = new InMemoryCheckoutLog();
    const id = await finished(log, 31);

    expect(await new PurgeCheckoutsJob(log, config(60)).run()).toBe(0);

    expect(log.statusOf(id)).toBe('COMPLETED');
  });

  it('no toca un PENDING, por viejo que sea', async () => {
    const log = new InMemoryCheckoutLog();
    const id = await finished(log, 500, 'PENDING');

    expect(await new PurgeCheckoutsJob(log, config(30)).run()).toBe(0);

    expect(log.statusOf(id)).toBe('PENDING');
  });

  it('sigue por lotes hasta vaciar lo vencido', async () => {
    const log = new InMemoryCheckoutLog();
    const total = PURGE_BATCH * 2 + 300;
    for (let i = 0; i < total; i++) await finished(log, 40, 'ABORTED');

    expect(await new PurgeCheckoutsJob(log, config(30)).run()).toBe(total);
  });

  it('pide los lotes de PURGE_BATCH', async () => {
    const log = new InMemoryCheckoutLog();
    const purge = vi.spyOn(log, 'purgeFinished');

    await new PurgeCheckoutsJob(log, config(30)).run();

    expect(purge).toHaveBeenCalledWith(30, PURGE_BATCH);
  });

  it('sin RETENTION_CHECKOUT_DAYS en la configuración falla de forma clara (no usa un valor propio)', async () => {
    const log = new InMemoryCheckoutLog();

    await expect(new PurgeCheckoutsJob(log, config()).run()).rejects.toThrow(
      /RETENTION_CHECKOUT_DAYS/,
    );
  });

  it('un error de la base no sale hacia el cron', async () => {
    const log = new InMemoryCheckoutLog();
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    vi.spyOn(log, 'purgeFinished').mockRejectedValue(new Error('base caída'));

    await expect(new PurgeCheckoutsJob(log, config(30)).run()).resolves.toBe(0);
    expect(error).toHaveBeenCalled();
  });

  it('queda registrado como tarea cron diaria de madrugada', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        PurgeCheckoutsJob,
        { provide: CheckoutLog, useValue: new InMemoryCheckoutLog() },
        { provide: ConfigService, useValue: config(30) },
      ],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      const jobs = [...app.get(SchedulerRegistry).getCronJobs().values()];
      expect(jobs).toHaveLength(1);
      expect(String(jobs[0]?.cronTime.source)).toMatch(/^0 0?3 \* \* \*$/);
    } finally {
      await app.close();
    }
  });
});
