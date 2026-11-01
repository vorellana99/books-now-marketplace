import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PurgeReservationsJob } from '../../../src/contexts/inventory/application/jobs/purge-reservations.job.js';
import { StockRepository } from '../../../src/contexts/inventory/domain/ports/stock.repository.js';
import { PURGE_BATCH } from '../../../src/platform/retention/purge-in-batches.js';
import { InMemoryStockRepository } from '../../fakes/in-memory-stock-repository.js';

const config = (days?: number) =>
  new ConfigService(
    days === undefined ? {} : { RETENTION_RESERVATION_DAYS: days },
  );
const A = '9780306406157';

async function confirmedDaysAgo(stock: InMemoryStockRepository, days: number) {
  const id = crypto.randomUUID();
  await stock.reserve(id, [{ isbn: A, quantity: 1 }]);
  await stock.confirm(id);
  stock.ageReservations(id, days);
  return id;
}

describe('PurgeReservationsJob (usa el puerto, no Prisma)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('borra las CONFIRMED con más de RETENTION_RESERVATION_DAYS y devuelve cuántas', async () => {
    const stock = new InMemoryStockRepository();
    stock.seed(A, 100);
    const old = await confirmedDaysAgo(stock, 120);
    const recent = await confirmedDaysAgo(stock, 5);

    expect(await new PurgeReservationsJob(stock, config(90)).run()).toBe(1);

    expect(stock.reservationsOf(old)).toEqual([]);
    expect(stock.reservationsOf(recent)).toHaveLength(1);
  });

  it('el plazo sale de la configuración', async () => {
    const stock = new InMemoryStockRepository();
    stock.seed(A, 100);
    await confirmedDaysAgo(stock, 120);

    expect(await new PurgeReservationsJob(stock, config(365)).run()).toBe(0);
  });

  it('pide los lotes de PURGE_BATCH', async () => {
    const stock = new InMemoryStockRepository();
    const purge = vi.spyOn(stock, 'purgeConfirmed');

    await new PurgeReservationsJob(stock, config(90)).run();

    expect(purge).toHaveBeenCalledWith(90, PURGE_BATCH);
  });

  it('sin la variable falla con un mensaje claro', async () => {
    await expect(
      new PurgeReservationsJob(new InMemoryStockRepository(), config()).run(),
    ).rejects.toThrow(/RETENTION_RESERVATION_DAYS/);
  });

  it('un error de la base no sale hacia el cron', async () => {
    const stock = new InMemoryStockRepository();
    vi.spyOn(stock, 'purgeConfirmed').mockRejectedValue(
      new Error('base caída'),
    );

    await expect(
      new PurgeReservationsJob(stock, config(90)).run(),
    ).resolves.toBe(0);
  });

  it('queda registrado como tarea cron diaria de madrugada', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        PurgeReservationsJob,
        { provide: StockRepository, useValue: new InMemoryStockRepository() },
        { provide: ConfigService, useValue: config(90) },
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
