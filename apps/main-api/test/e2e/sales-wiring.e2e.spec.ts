import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { PlaceOrderCommand } from '../../src/contexts/sales/application/order/place-order.command.js';
import { RecoverCheckoutsJob } from '../../src/contexts/sales/application/order/recover-checkouts.job.js';
import { CustomerRepository } from '../../src/contexts/sales/domain/customer/customer.repository.js';
import { CatalogPricing } from '../../src/contexts/sales/domain/order/catalog-pricing.port.js';
import { CheckoutLog } from '../../src/contexts/sales/domain/order/checkout-log.port.js';
import { Notifier } from '../../src/contexts/sales/domain/order/notifier.port.js';
import { OrderRepository } from '../../src/contexts/sales/domain/order/order.repository.js';
import { StockReservation } from '../../src/contexts/sales/domain/order/stock-reservation.port.js';
import { PaymentGateway } from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import { CatalogInProcessAdapter } from '../../src/contexts/sales/infrastructure/adapters/catalog-in-process.adapter.js';
import { ConsoleNotifier } from '../../src/contexts/sales/infrastructure/adapters/console-notifier.adapter.js';
import { InventoryInProcessAdapter } from '../../src/contexts/sales/infrastructure/adapters/inventory-in-process.adapter.js';
import { PrismaCheckoutLog } from '../../src/contexts/sales/infrastructure/persistence/prisma-checkout-log.adapter.js';
import { PrismaOrderRepository } from '../../src/contexts/sales/infrastructure/persistence/prisma-order.repository.js';
import { PrismaCustomerRepository } from '../../src/contexts/sales/infrastructure/persistence/prisma-customer.repository.js';
import { ExternalPaymentAdapter } from '../../src/contexts/sales/infrastructure/adapters/external-payment.adapter.js';
import { SimulatedPaymentGateway } from '../../src/contexts/sales/infrastructure/adapters/simulated-payment-gateway.adapter.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { OutboxRegistry } from '../../src/platform/outbox/outbox.registry.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';
import { bearer } from '../support/auth.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp, withEnv } from '../support/nest.js';

async function appWithEverything() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

describe('SalesModule en la aplicación completa', () => {
  describe('con la configuración por defecto (PAYMENT_PROVIDER=fake)', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await appWithEverything();
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);

    it('cada puerto de Ventas tiene su implementación real', () => {
      const get = <T>(token: abstract new (...args: never[]) => T) =>
        app.get(token as never, { strict: false }) as T;
      expect(get(OrderRepository)).toBeInstanceOf(PrismaOrderRepository);
      expect(get(CheckoutLog)).toBeInstanceOf(PrismaCheckoutLog);
      expect(get(CustomerRepository)).toBeInstanceOf(PrismaCustomerRepository);
      expect(get(CatalogPricing)).toBeInstanceOf(CatalogInProcessAdapter);
      expect(get(StockReservation)).toBeInstanceOf(InventoryInProcessAdapter);
      expect(get(Notifier)).toBeInstanceOf(ConsoleNotifier);
    });

    it('los dos consumidores de sales.order.placed quedan registrados', () => {
      const names = app
        .get(OutboxRegistry)
        .consumersOf('sales.order.placed')
        .sort((a, b) => a.localeCompare(b));
      expect(names).toEqual([
        'inventory.confirm-reservation',
        'sales.send-order-confirmation',
      ]);
    });

    it('el job de recuperación está registrado cada 5 minutos', () => {
      expect(app.get(RecoverCheckoutsJob, { strict: false })).toBeDefined();
      const crons = [...app.get(SchedulerRegistry).getCronJobs().values()].map(
        (job) => String(job.cronTime.source),
      );
      expect(crons).toContain('0 */5 * * * *');
    });

    it('PlaceOrderCommand tiene su handler: un cliente inexistente da NotFoundError', async () => {
      const error = await app
        .get(CommandBus)
        .execute(
          new PlaceOrderCommand(
            randomUUID(),
            randomUUID(),
            [{ isbn: '9780132350884', quantity: 1 }],
            {
              recipient: 'Ana',
              phone: '999888777',
              line1: 'Av. Larco 123',
              district: 'Miraflores',
              province: 'Lima',
              department: 'Lima',
            },
            'tok_visa',
          ),
        )
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it('las rutas de pedidos están publicadas: sin clave, 400; pedido inexistente, 404', async () => {
      const http = app.getHttpServer();
      const auth = await bearer(app, 'BUYER');
      await request(http)
        .post('/orders')
        .set(auth)
        .send({
          cardToken: 'tok_visa',
          items: [{ isbn: '9780132350884', quantity: 1 }],
        })
        .expect(400);
      await request(http).get(`/orders/${randomUUID()}`).set(auth).expect(404);
    });
  });

  // AppModule valida el entorno una sola vez, al importarse: para cambiarlo se arma el mismo conjunto de módulos
  // con createTestApp, que valida en cada llamada
  describe('con PAYMENT_PROVIDER=external', () => {
    const build = (env: Record<string, string>) =>
      withEnv(env, () =>
        createTestApp(
          OutboxModule,
          CatalogModule,
          InventoryModule,
          SalesModule,
        ),
      );

    it('la pasarela es el adaptador HTTP', async () => {
      const app = await build({
        PAYMENT_PROVIDER: 'external',
        PAYMENT_API_URL: 'http://127.0.0.1:9',
      });
      try {
        expect(app.get(PaymentGateway, { strict: false })).toBeInstanceOf(
          ExternalPaymentAdapter,
        );
      } finally {
        await app.close();
      }
    });

    it('la simulada recibe la demora de PAYMENT_SIMULATED_DELAY_MS', async () => {
      const app = await build({
        PAYMENT_PROVIDER: 'fake',
        PAYMENT_SIMULATED_DELAY_MS: '1234',
      });
      try {
        const gateway = app.get(PaymentGateway, { strict: false });
        expect((gateway as SimulatedPaymentGateway).delayMs).toBe(1234);
      } finally {
        await app.close();
      }
    });

    it('el notificador recibe la demora de EMAIL_SIMULATED_DELAY_MS', async () => {
      const app = await build({
        PAYMENT_PROVIDER: 'fake',
        EMAIL_SIMULATED_DELAY_MS: '777',
      });
      try {
        const notifier = app.get(Notifier, { strict: false });
        expect(notifier).toBeInstanceOf(ConsoleNotifier);
        expect((notifier as ConsoleNotifier).delayMs).toBe(777);
      } finally {
        await app.close();
      }
    });

    it('con fake, la simulada', async () => {
      const app = await build({ PAYMENT_PROVIDER: 'fake' });
      try {
        expect(app.get(PaymentGateway, { strict: false })).toBeInstanceOf(
          SimulatedPaymentGateway,
        );
      } finally {
        await app.close();
      }
    });

    it('sin PAYMENT_API_URL la aplicación no arranca', async () => {
      await expect(
        build({ PAYMENT_PROVIDER: 'external', PAYMENT_API_URL: '' }),
      ).rejects.toThrow(/PAYMENT_API_URL/);
    });
  });
});
