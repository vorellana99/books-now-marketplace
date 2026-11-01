import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { PrismaOrderHistory } from '../../src/contexts/sales/infrastructure/persistence/prisma-order-history.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { orderHistoryContract } from '../support/order-history.contract.js';
import type { SeedOrder } from '../fakes/in-memory-order-history.js';

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});
afterAll(async () => {
  await app.close();
});

const customers = new Set<string>();

// El mismo contrato que cumple el fake en memoria, contra PostgreSQL real
orderHistoryContract('Prisma', async () => {
  await resetDatabase();
  customers.clear();
  return {
    history: new PrismaOrderHistory(app.get(PrismaService)),
    seed: async (order) => {
      const seeded: SeedOrder = {
        id: randomUUID(),
        createdAt: new Date(),
        currency: 'PEN',
        charged: '90.00',
        lines: [
          {
            isbn: '9780132350884',
            title: 'Clean Code',
            unitPrice: '45.000000',
            quantity: 2,
          },
        ],
        shipping: null,
        ...order,
      };
      if (!customers.has(seeded.customerId)) {
        await query(
          'INSERT INTO sales.customers (id, email, premium) VALUES ($1, $2, false)',
          [seeded.customerId, `${seeded.customerId}@example.com`],
        );
        customers.add(seeded.customerId);
      }
      const ship = seeded.shipping;
      await query(
        `INSERT INTO sales.orders (id, customer_id, status, charged_amount, currency, created_at,
           ship_recipient, ship_phone, ship_line1, ship_district, ship_province, ship_department, ship_reference)
         VALUES ($1, $2, 'PLACED', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          seeded.id,
          seeded.customerId,
          seeded.charged,
          seeded.currency,
          seeded.createdAt.toISOString(),
          ship?.recipient ?? null,
          ship?.phone ?? null,
          ship?.line1 ?? null,
          ship?.district ?? null,
          ship?.province ?? null,
          ship?.department ?? null,
          ship?.reference ?? null,
        ],
      );
      for (const l of seeded.lines) {
        await query(
          `INSERT INTO sales.order_lines (order_id, isbn, title, unit_price, currency, quantity)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            seeded.id,
            l.isbn,
            l.title,
            l.unitPrice,
            seeded.currency,
            l.quantity,
          ],
        );
      }
      return seeded;
    },
  };
});
