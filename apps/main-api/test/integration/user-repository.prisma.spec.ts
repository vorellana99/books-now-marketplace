import { Module, type INestApplication } from '@nestjs/common';
import { PrismaUserRepository } from '../../src/contexts/identity/infrastructure/persistence/prisma-user.repository.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { UserRegisteredProbe } from '../support/outbox-probes.js';
import {
  userRepositoryContract,
  type PublishedEvent,
} from '../support/user-repository.contract.js';

// El Outbox solo guarda un evento si alguien lo escucha: el consumidor de prueba lo hace
@Module({ providers: [UserRegisteredProbe] })
class Probes {}

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp(OutboxModule, Probes);
});
afterAll(async () => {
  await app.close();
});

// El mismo contrato que cumple el fake en memoria, contra PostgreSQL real y el Outbox real
userRepositoryContract('Prisma', async () => {
  await resetDatabase();
  return {
    repo: new PrismaUserRepository(
      app.get(PrismaService),
      app.get(OutboxWriter),
    ),
    published: async () =>
      (
        await query<{
          event_name: string;
          aggregate_id: string;
          payload: Record<string, unknown>;
        }>(
          'SELECT event_name, aggregate_id, payload FROM messaging.outbox ORDER BY id',
        )
      ).map((r): PublishedEvent => ({
        eventName: r.event_name,
        aggregateId: r.aggregate_id,
        payload: r.payload,
      })),
    count: async () =>
      Number(
        (
          await query<{ n: string }>('SELECT count(*) AS n FROM identity.users')
        )[0]?.n,
      ),
  };
});
