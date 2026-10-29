import { Logger, type INestApplication } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { PurgeRefreshTokensJob } from '../../src/contexts/identity/application/purge-refresh-tokens.job.js';
import { PurgeReservationsJob } from '../../src/contexts/inventory/application/stock/purge-reservations.job.js';
import { PurgeCheckoutsJob } from '../../src/contexts/sales/application/order/purge-checkouts.job.js';
import { OutboxPurgeJob } from '../../src/platform/outbox/outbox-purge.job.js';

describe('Purga de datos viejos: cableado (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it.each([
    ['outbox', OutboxPurgeJob],
    ['checkouts', PurgeCheckoutsJob],
    ['reservas', PurgeReservationsJob],
    ['tokens de refresco', PurgeRefreshTokensJob],
  ])('el job de %s existe en la aplicación', (_name, job) => {
    expect(app.get(job, { strict: false })).toBeDefined();
  });

  it('los cuatro corren cada día de madrugada, además de los que ya había', () => {
    const crons = [...app.get(SchedulerRegistry).getCronJobs().values()].map(
      (job) => String(job.cronTime.source),
    );
    expect(crons.filter((c) => /^0 0?3 \* \* \*$/.test(c))).toHaveLength(4);
    expect(crons).toContain('0 */5 * * * *'); // la recuperación de checkouts sigue
  });
});
