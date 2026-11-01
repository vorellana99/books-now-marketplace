import { Module, type INestApplication } from '@nestjs/common';
import { PrismaBookCatalog } from '../../src/contexts/catalog/infrastructure/persistence/prisma-book-catalog.js';
import { PrismaBookRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-book.repository.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { insertBook } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import {
  bookPortsContract,
  type BookRow,
  type PublishedEvent,
} from '../support/book-ports.contract.js';
import { createTestApp } from '../support/nest.js';
import { BookCreatedProbe } from '../support/outbox-probes.js';

// El Outbox solo guarda un evento si alguien lo escucha: el consumidor de prueba lo hace
@Module({ providers: [BookCreatedProbe] })
class Probes {}

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp(OutboxModule, Probes);
});
afterAll(async () => {
  await app.close();
});

// El mismo contrato que cumple el fake en memoria, contra PostgreSQL y el Outbox reales
bookPortsContract('Prisma', async () => {
  await resetDatabase();
  const prisma = app.get(PrismaService);
  return {
    repo: new PrismaBookRepository(prisma, app.get(OutboxWriter)),
    catalog: new PrismaBookCatalog(prisma),
    seed: (book) => insertBook(book),
    rowOf: async (isbn) => {
      const [row] = await query<BookRow>(
        `SELECT title, author, price::text AS price, currency::text AS currency, active
         FROM catalog.books WHERE isbn = $1`,
        [isbn],
      );
      return row;
    },
    count: async () =>
      Number(
        (
          await query<{ n: string }>('SELECT count(*) AS n FROM catalog.books')
        )[0]?.n,
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
  };
});
