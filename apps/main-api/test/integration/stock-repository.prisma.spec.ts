import type { INestApplication } from '@nestjs/common';
import { PrismaStockRepository } from '../../src/contexts/inventory/infrastructure/persistence/prisma-stock.repository.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { toTransactionHandle } from '../../src/platform/prisma/transaction-handle.js';
import { insertStock, reservationsOf, stockOf } from '../support/builders.js';
import {
  query,
  resetDatabase,
  slowDownStockUpdates,
} from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { stockRepositoryContract } from '../support/stock-repository.contract.js';

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
stockRepositoryContract('Prisma', async () => {
  await resetDatabase();
  return {
    repo: new PrismaStockRepository(prisma),
    seed: insertStock,
    levelOf: stockOf,
    reservationsOf,
    ageReservations: async (orderId, days) => {
      await query(
        'UPDATE inventory.reservations SET created_at = now() - make_interval(days => $2) WHERE order_id = $1',
        [orderId, days],
      );
    },
    withTransaction: (fn) =>
      prisma.$transaction(async (tx) => fn(toTransactionHandle(tx))),
    widenRaceWindow: () => slowDownStockUpdates(40),
  };
});
