import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PurgeRefreshTokensJob } from '../../../src/contexts/identity/application/purge-refresh-tokens.job.js';
import { SessionRepository } from '../../../src/contexts/identity/domain/ports/session.repository.js';
import { Session } from '../../../src/contexts/identity/domain/session/session.aggregate.js';
import { PURGE_BATCH } from '../../../src/platform/retention/purge-in-batches.js';
import { InMemorySessionRepository } from '../../fakes/in-memory-session-repository.js';

const DAY = 86_400_000;
const config = (days?: number) =>
  new ConfigService(
    days === undefined ? {} : { RETENTION_REFRESH_TOKEN_DAYS: days },
  );
const USER = '11111111-1111-4111-8111-111111111111';

async function usedDaysAgo(repo: InMemorySessionRepository, days: number) {
  const { session } = Session.start({
    userId: USER,
    now: new Date(),
    ttlMs: 30 * DAY,
  });
  await repo.open(session);
  const row = repo.rows().at(-1);
  repo.setDates(row?.id as string, {
    usedAt: new Date(Date.now() - days * DAY),
  });
  return row?.id as string;
}

describe('PurgeRefreshTokensJob (usa el puerto, no Prisma)', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('borra lo usado hace más de RETENTION_REFRESH_TOKEN_DAYS y devuelve cuántos', async () => {
    const repo = new InMemorySessionRepository();
    const old = await usedDaysAgo(repo, 8);
    const recent = await usedDaysAgo(repo, 2);

    expect(await new PurgeRefreshTokensJob(repo, config(7)).run()).toBe(1);

    const left = repo.rows().map((r) => r.id);
    expect(left).not.toContain(old);
    expect(left).toContain(recent);
  });

  it('el plazo sale de la configuración', async () => {
    const repo = new InMemorySessionRepository();
    await usedDaysAgo(repo, 8);

    expect(await new PurgeRefreshTokensJob(repo, config(30)).run()).toBe(0);
  });

  it('pide los lotes de PURGE_BATCH', async () => {
    const repo = new InMemorySessionRepository();
    const purge = vi.spyOn(repo, 'purgeFinished');

    await new PurgeRefreshTokensJob(repo, config(7)).run();

    expect(purge).toHaveBeenCalledWith(7, PURGE_BATCH);
  });

  it('sin la variable falla con un mensaje claro', async () => {
    const repo = new InMemorySessionRepository();

    await expect(
      new PurgeRefreshTokensJob(repo, config()).run(),
    ).rejects.toThrow(/RETENTION_REFRESH_TOKEN_DAYS/);
  });

  it('un error de la base no sale hacia el cron', async () => {
    const repo = new InMemorySessionRepository();
    vi.spyOn(repo, 'purgeFinished').mockRejectedValue(new Error('base caída'));

    await expect(
      new PurgeRefreshTokensJob(repo, config(7)).run(),
    ).resolves.toBe(0);
  });

  it('queda registrado como tarea cron diaria de madrugada', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        PurgeRefreshTokensJob,
        {
          provide: SessionRepository,
          useValue: new InMemorySessionRepository(),
        },
        { provide: ConfigService, useValue: config(7) },
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
