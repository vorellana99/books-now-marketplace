import type { INestApplication } from '@nestjs/common';
import { PrismaSessionRepository } from '../../src/contexts/identity/infrastructure/persistence/prisma-session.repository.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import {
  sessionRepositoryContract,
  type TokenRow,
} from '../support/session-repository.contract.js';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await app.close();
});

// El mismo contrato que cumple el fake en memoria, contra PostgreSQL real
sessionRepositoryContract('Prisma', async () => {
  await resetDatabase();
  return {
    repo: new PrismaSessionRepository(prisma),
    // la tabla de tokens tiene una clave foránea a identity.users
    prepare: async (userId) => {
      await query(
        `INSERT INTO identity.users (id, email, password_hash, role) VALUES ($1, $2, 'x', 'BUYER')
         ON CONFLICT (id) DO NOTHING`,
        [userId, `${userId}@example.com`],
      );
    },
    rows: () =>
      query<TokenRow>(
        `SELECT id, family_id AS "familyId", user_id AS "userId", token_hash AS hash,
                expires_at AS "expiresAt", used_at AS "usedAt", revoked_at AS "revokedAt"
         FROM identity.refresh_tokens ORDER BY created_at, id`,
      ),
    setDates: async (tokenId, dates) => {
      // `pg` serializa un Date en hora local: se pasa como texto ISO
      // la base exige que el vencimiento sea posterior a la creación: si se vence en el pasado, se retrasa también la creación
      await query(
        `UPDATE identity.refresh_tokens SET
           created_at = LEAST(created_at, COALESCE($2::timestamp, expires_at) - interval '1 second'),
           expires_at = COALESCE($2::timestamp, expires_at),
           used_at = COALESCE($3::timestamp, used_at),
           revoked_at = COALESCE($4::timestamp, revoked_at)
         WHERE id = $1`,
        [
          tokenId,
          dates.expiresAt?.toISOString() ?? null,
          dates.usedAt?.toISOString() ?? null,
          dates.revokedAt?.toISOString() ?? null,
        ],
      );
    },
  };
});
