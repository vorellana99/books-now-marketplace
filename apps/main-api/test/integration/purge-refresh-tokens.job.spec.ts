import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaSessionRepository } from '../../src/contexts/identity/infrastructure/persistence/prisma-session.repository.js';
import { PurgeRefreshTokensJob } from '../../src/contexts/identity/application/purge-refresh-tokens.job.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { PURGE_BATCH } from '../../src/platform/retention/purge-in-batches.js';
import { holdRowLock, query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

interface TokenSpec {
  expiresInDays?: number; // negativo: venció hace tantos días
  usedDaysAgo?: number;
  revokedDaysAgo?: number;
  createdDaysAgo?: number;
}

describe('PurgeRefreshTokensJob (PostgreSQL real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  const job = (days = 7) =>
    new PurgeRefreshTokensJob(
      new PrismaSessionRepository(prisma),
      new ConfigService({ RETENTION_REFRESH_TOKEN_DAYS: days }),
    );

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    userId = randomUUID();
    await query(
      `INSERT INTO identity.users (id, email, password_hash, role) VALUES ($1, $2, 'x', 'BUYER')`,
      [userId, `${userId}@example.com`],
    );
  });
  afterEach(() => vi.restoreAllMocks());

  async function token(spec: TokenSpec): Promise<string> {
    const id = randomUUID();
    await query(
      `INSERT INTO identity.refresh_tokens (id, user_id, family_id, token_hash, created_at, expires_at, used_at, revoked_at)
       VALUES ($1, $2, $3, $4,
         now() - make_interval(days => $5),
         now() + make_interval(days => $6),
         CASE WHEN $7::int IS NULL THEN NULL ELSE now() - make_interval(days => $7::int) END,
         CASE WHEN $8::int IS NULL THEN NULL ELSE now() - make_interval(days => $8::int) END)`,
      [
        id,
        userId,
        randomUUID(),
        randomUUID().replaceAll('-', '').repeat(2), // 64 caracteres hexadecimales, como un SHA-256
        spec.createdDaysAgo ?? 60,
        spec.expiresInDays ?? 14,
        spec.usedDaysAgo ?? null,
        spec.revokedDaysAgo ?? null,
      ],
    );
    return id;
  }
  const exists = async (id: string) =>
    (await query('SELECT 1 FROM identity.refresh_tokens WHERE id = $1', [id]))
      .length === 1;

  it('borra un token que venció hace más del plazo', async () => {
    const id = await token({ expiresInDays: -8, createdDaysAgo: 30 });

    expect(await job().run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('borra uno que se usó hace más del plazo, aunque no haya vencido', async () => {
    const id = await token({ usedDaysAgo: 8 });

    expect(await job().run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('borra uno que se revocó hace más del plazo', async () => {
    const id = await token({ revokedDaysAgo: 8 });

    expect(await job().run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('conserva los recientes: la detección de reutilización necesita el token usado un tiempo', async () => {
    const expired = await token({ expiresInDays: -6 });
    const used = await token({ usedDaysAgo: 6 });
    const revoked = await token({ revokedDaysAgo: 6 });

    expect(await job().run()).toBe(0);

    expect(await exists(expired)).toBe(true);
    expect(await exists(used)).toBe(true);
    expect(await exists(revoked)).toBe(true);
  });

  it('nunca borra un token vigente (sin usar, sin revocar y sin vencer), por antiguo que sea', async () => {
    const id = await token({ createdDaysAgo: 400, expiresInDays: 1 });

    expect(await job().run()).toBe(0);

    expect(await exists(id)).toBe(true);
  });

  it('el plazo sale de RETENTION_REFRESH_TOKEN_DAYS', async () => {
    const id = await token({ usedDaysAgo: 3 });

    expect(await job(7).run()).toBe(0);
    expect(await job(2).run()).toBe(1);

    expect(await exists(id)).toBe(false);
  });

  it('no toca a los usuarios', async () => {
    await token({ usedDaysAgo: 30 });

    await job().run();

    expect(
      (await query('SELECT 1 FROM identity.users WHERE id = $1', [userId]))
        .length,
    ).toBe(1);
  });

  it('pasa de largo por un token que otra transacción tiene bloqueado, en vez de esperarla (SKIP LOCKED)', async () => {
    const free = await token({ usedDaysAgo: 30 });
    const busy = await token({ usedDaysAgo: 30 });
    const release = await holdRowLock(
      'SELECT 1 FROM identity.refresh_tokens WHERE id = $1 FOR UPDATE',
      [busy],
    );
    try {
      expect(await job().run()).toBe(1);
      expect(await exists(free)).toBe(false);
      expect(await exists(busy)).toBe(true);
    } finally {
      await release();
    }
    expect(await job().run()).toBe(1);
  });

  it('vacía más de un lote en una sola vuelta', async () => {
    const total = PURGE_BATCH * 2 + 300;
    await query(
      `INSERT INTO identity.refresh_tokens (id, user_id, family_id, token_hash, expires_at, used_at)
       SELECT gen_random_uuid(), $1, gen_random_uuid(), md5(random()::text) || md5(random()::text), now() + interval '1 day', now() - interval '30 days'
       FROM generate_series(1, $2)`,
      [userId, total],
    );

    expect(await job().run()).toBe(total);
  });

  it('dos instancias a la vez no se pisan', async () => {
    const total = PURGE_BATCH + 500;
    await query(
      `INSERT INTO identity.refresh_tokens (id, user_id, family_id, token_hash, expires_at, used_at)
       SELECT gen_random_uuid(), $1, gen_random_uuid(), md5(random()::text) || md5(random()::text), now() + interval '1 day', now() - interval '30 days'
       FROM generate_series(1, $2)`,
      [userId, total],
    );

    const [a, b] = await Promise.all([job().run(), job().run()]);

    expect(a + b).toBe(total);
  });
});
