import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { PaymentGateway } from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import type { SimulatedPaymentGateway } from '../../src/contexts/sales/infrastructure/adapters/simulated-payment-gateway.adapter.js';
import { envSchema } from '../../src/platform/config/env.schema.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { RequestAwareLogger } from '../../src/platform/observability/request-aware.logger.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { PrismaModule } from '../../src/platform/prisma/prisma.module.js';
import {
  deliveryRows,
  insertBook,
  insertCustomer,
  insertStock,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { bearer } from '../support/auth.js';
import { query, resetDatabase } from '../support/database.js';
import { withEnv } from '../support/nest.js';

// La misma aplicación que AppModule, pero con la demora de los proveedores simulados real (escalada de 3 s a 600 ms
// para que el test no sea lento). AppModule valida el entorno al importarse, así que se arman los mismos módulos
// con una validación nueva
const DELAY = 600;

describe('Compra con proveedores lentos, sin compuertas (e2e, aplicación completa y PostgreSQL real)', () => {
  let app: INestApplication;
  let gateway: SimulatedPaymentGateway;
  let logs: { at: number; line: Record<string, string> }[];

  beforeAll(async () => {
    const moduleRef = await withEnv(
      {
        PAYMENT_PROVIDER: 'fake',
        PAYMENT_SIMULATED_DELAY_MS: String(DELAY),
        EMAIL_SIMULATED_DELAY_MS: String(DELAY),
      },
      () =>
        Test.createTestingModule({
          imports: [
            ConfigModule.forRoot({
              isGlobal: true,
              validate: (env) => envSchema.parse(env),
            }),
            CqrsModule.forRoot(),
            ScheduleModule.forRoot(),
            PrismaModule,
            OutboxModule,
            CatalogModule,
            InventoryModule,
            SalesModule,
            IdentityModule,
            AUTH_MODULE,
          ],
        }).compile(),
    );
    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useLogger(new RequestAwareLogger({ json: true }));
    await app.init();
    gateway = app.get(PaymentGateway, {
      strict: false,
    }) as SimulatedPaymentGateway;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    logs = [];
    // el error esperado de tok_error sale por stderr
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      for (const text of String(chunk).split('\n').filter(Boolean)) {
        try {
          logs.push({
            at: Date.now(),
            line: JSON.parse(text) as Record<string, string>,
          });
        } catch {
          // no es una línea de log en JSON
        }
      }
      return true;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  // Cada comprador compra con su token: se firma al crear al cliente (en setup) y se busca aquí
  const tokens = new Map<string, { Authorization: string }>();
  const post = (
    customerId: string,
    isbn: string,
    key = randomUUID(),
    cardToken = 'tok_visa',
  ) =>
    request(app.getHttpServer())
      .post('/orders')
      .set(tokens.get(customerId)!)
      .set('Idempotency-Key', key)
      .send({
        cardToken,
        items: [{ isbn, quantity: 1 }],
        shippingAddress: {
          recipient: 'Luis Lento',
          phone: '999888777',
          line1: 'Av. Lenta 1',
          district: 'Miraflores',
          province: 'Lima',
          department: 'Lima',
        },
      });

  async function setup() {
    const customer = await insertCustomer({ email: 'lenta@example.com' });
    tokens.set(customer.id, await bearer(app, 'BUYER', customer.id));
    const book = await insertBook({ price: '100.00' });
    await insertStock(book.isbn, 10);
    return { customer, book };
  }
  const waitFor = async (done: () => Promise<boolean>, timeoutMs = 15_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!(await done()) && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const chargesOf = (orderId: string) =>
    gateway.charges.filter((c) => c.orderId === orderId);
  const emailLogs = () =>
    logs.filter((l) => l.line.message?.includes('Email a '));

  it('la compra tarda lo que tarda la pasarela', async () => {
    const { customer, book } = await setup();

    const started = Date.now();
    const res = await post(customer.id, book.isbn).expect(201);

    expect(Date.now() - started).toBeGreaterThanOrEqual(DELAY - 50);
    expect(chargesOf(res.body.orderId)).toHaveLength(1);
    expect(res.body.charged).toEqual({ amount: '110.00', currency: 'PEN' });
  });

  it('una segunda petición con la misma clave durante la demora recibe 409, sin compuertas; después la primera termina y el reintento devuelve el mismo pedido', async () => {
    const { customer, book } = await setup();
    const key = randomUUID();
    const chargesBefore = gateway.charges.length;

    const first = post(customer.id, book.isbn, key).then((r) => r);
    await new Promise((r) => setTimeout(r, DELAY / 3)); // la primera ya está dentro del cobro
    const second = await post(customer.id, book.isbn, key).expect(409);
    expect(second.body.errorCode).toBe('CHECKOUT_IN_PROGRESS');

    const created = await first;
    expect(created.status).toBe(201);
    const retry = await post(customer.id, book.isbn, key).expect(201);
    expect(retry.body.orderId).toBe(created.body.orderId);
    expect(chargesOf(created.body.orderId)).toHaveLength(1);
    expect(gateway.charges).toHaveLength(chargesBefore + 1);
  });

  it('un pago rechazado tarda lo del cobro y deja todo como estaba', async () => {
    const { customer, book } = await setup();

    const started = Date.now();
    const res = await post(
      customer.id,
      book.isbn,
      randomUUID(),
      'tok_declined',
    ).expect(422);

    expect(Date.now() - started).toBeGreaterThanOrEqual(DELAY - 50);
    expect(res.body.errorCode).toBe('PAYMENT_DECLINED');
    expect(await stockOf(book.isbn)).toEqual({ available: 10, reserved: 0 });
  });

  it('un error de la pasarela suma al cobro el reembolso de la compensación, también lento', async () => {
    const { customer, book } = await setup();

    const started = Date.now();
    await post(customer.id, book.isbn, randomUUID(), 'tok_error').expect(500);

    expect(Date.now() - started).toBeGreaterThanOrEqual(2 * DELAY - 100);
    expect(await stockOf(book.isbn)).toEqual({ available: 10, reserved: 0 });
    const [{ n }] = await query<{ n: string }>(
      "SELECT count(*) AS n FROM sales.checkouts WHERE status = 'ABORTED'",
    );
    expect(Number(n)).toBe(1);
  });

  it('el correo sale al terminar su demora, con la entrega reclamada mientras tanto, y la reserva queda CONFIRMED', async () => {
    const { customer, book } = await setup();
    const res = await post(customer.id, book.isbn).expect(201);

    // Se mira la tabla cada 25 ms. Con el proveedor lento tiene que existir un tiempo (de unos 600 ms) en el que el
    // relay ya reclamó la entrega del correo (PENDING con un intento y un bloqueo) y el correo todavía no salió. No se
    // mide cuánto dura lo observado, porque con la máquina cargada la observación llega tarde: basta con haber visto
    // la entrega reclamada sin correo. Sin demora, ese tiempo dura milisegundos y casi nunca se ve
    let claimedWithoutEmail = false;
    const deadline = Date.now() + 15_000;
    while (emailLogs().length === 0 && Date.now() < deadline) {
      const mail = (await deliveryRows()).find(
        (d) => d.consumer === 'sales.send-order-confirmation',
      );
      const claimed =
        mail?.status === 'PENDING' && mail.attempts >= 1 && !!mail.locked_until;
      if (claimed && emailLogs().length === 0) claimedWithoutEmail = true;
      await new Promise((r) => setTimeout(r, 25));
    }
    await waitFor(
      async () =>
        (await deliveryRows()).filter((d) => d.status === 'DONE').length === 2,
    );

    const [email] = emailLogs();
    expect(email.line.message).toContain('lenta@example.com');
    expect(email.line.message).toContain(res.body.orderId);
    expect(claimedWithoutEmail).toBe(true);
    expect(await reservationsOf(res.body.orderId)).toEqual([
      { isbn: book.isbn, quantity: 1, status: 'CONFIRMED' },
    ]);
  });
});
