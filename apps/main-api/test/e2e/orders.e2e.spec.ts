import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PaymentGateway } from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import type { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { SimulatedPaymentGateway } from '../../src/contexts/sales/infrastructure/payment/simulated-payment-gateway.adapter.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { RequestAwareLogger } from '../../src/platform/observability/request-aware.logger.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import {
  deliveryRows,
  insertBook,
  insertCustomer,
  insertStock,
  outboxRows,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { bearer } from '../support/auth.js';
import { query, resetDatabase } from '../support/database.js';

const TOKEN = 'tok_secreto_de_prueba_123';
const ADDRESS_BODY = {
  recipient: 'María Quispe',
  phone: '+51 987 654 321',
  line1: 'Jr. Ucayali 150, Dpto 2',
  district: 'Barranco',
  province: 'Lima',
  department: 'Lima',
  reference: 'Casa de rejas verdes',
};

// Una pasarela que puede quedarse parada dentro del cobro hasta que el test la suelte
class GateableGateway extends SimulatedPaymentGateway {
  private gate: Promise<void> | undefined;
  private onEntered: (() => void) | undefined;

  hold(): { entered: Promise<void>; release: () => void } {
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => (release = resolve));
    const entered = new Promise<void>((resolve) => (this.onEntered = resolve));
    return {
      entered,
      release: () => {
        this.gate = undefined;
        release();
      },
    };
  }

  override async charge(amount: Money, cardToken: string, orderId: string) {
    this.onEntered?.();
    await this.gate;
    return super.charge(amount, cardToken, orderId);
  }
}

describe('POST /orders y GET /orders/:id (e2e, aplicación completa y PostgreSQL real)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  // Cada test arranca con una pasarela limpia, sin reiniciar la aplicación
  let gateway: GateableGateway;
  const delegate = {
    charge: (...args: Parameters<PaymentGateway['charge']>) =>
      gateway.charge(...args),
    refund: (orderId: string) => gateway.refund(orderId),
  } as PaymentGateway;
  let logLines: string[];
  // Las rutas de pedidos exigen sesión. La tarea 7.7 hará que el cliente sea el del token
  let auth: { Authorization: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PaymentGateway)
      .useValue(delegate)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    app.useLogger(new RequestAwareLogger({ json: true }));
    await app.init();
    relay = app.get(OutboxRelay);
    auth = await bearer(app, 'BUYER');
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    gateway = new GateableGateway();
    logLines = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      logLines.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      logLines.push(String(chunk));
      return true;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  // ── ayudas ──────────────────────────────────────────────────────────────────────────────────
  const post = (
    body: unknown,
    key: string | null = randomUUID(),
    requestId?: string,
  ) => {
    const req = request(app.getHttpServer()).post('/orders').set(auth);
    if (key !== null) req.set('Idempotency-Key', key);
    if (requestId) req.set('X-Request-Id', requestId);
    return req.send(body as object);
  };
  const cart = (
    customerId: string,
    items: { isbn: string; quantity: number }[],
    cardToken = 'tok_visa',
  ) => ({ customerId, cardToken, items, shippingAddress: ADDRESS_BODY });

  async function book(
    price = '100.00',
    options: {
      stock?: number;
      currency?: 'PEN' | 'USD';
      active?: boolean;
    } = {},
  ) {
    const b = await insertBook({
      price,
      currency: options.currency ?? 'PEN',
      active: options.active ?? true,
    });
    await insertStock(b.isbn, options.stock ?? 10);
    return b;
  }

  const checkoutOf = async (orderId: string) =>
    (
      await query<{ status: string; request_id: string | null }>(
        'SELECT status::text AS status, request_id FROM sales.checkouts WHERE order_id = $1',
        [orderId],
      )
    )[0];
  const count = async (table: string) =>
    Number(
      (await query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n,
    );

  // El relay corre solo cada segundo; aquí se le ayuda y se espera (con un tope) a que entregue todo
  async function deliverEvents(expected: number) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      await relay.runOnce();
      const done = (await deliveryRows()).filter((d) => d.status === 'DONE');
      if (done.length >= expected || Date.now() > deadline) return done.length;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  const emailLogs = () =>
    logLines
      .filter((l) => l.includes('Email a '))
      .map((l) => JSON.parse(l) as Record<string, string>);

  // ── la compra completa ─────────────────────────────────────────────────────────────────────
  describe('una compra exitosa', () => {
    it('cliente premium: 201, descuento y envío gratis; reserva CONFIRMED, email en el log y /health/outbox 200', async () => {
      const premium = await insertCustomer({
        premium: true,
        email: 'premium@example.com',
      });
      const b = await book('100.00');

      const res = await post(
        cart(premium.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);

      expect(res.body).toEqual({
        orderId: expect.any(String),
        charged: { amount: '90.00', currency: 'PEN' }, // 100 − 10 %, envío gratis
      });
      const orderId = res.body.orderId as string;
      expect(gateway.charges).toEqual([
        { orderId, amount: '90.00', currency: 'PEN' },
      ]);
      expect(await stockOf(b.isbn)).toEqual({ available: 9, reserved: 1 });
      expect((await checkoutOf(orderId)).status).toBe('COMPLETED');

      // los dos consumidores del evento
      await deliverEvents(2);
      expect(await reservationsOf(orderId)).toEqual([
        { isbn: b.isbn, quantity: 1, status: 'CONFIRMED' },
      ]);
      const logs = emailLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toContain('premium@example.com');
      expect(logs[0].message).toContain(orderId);
      // el correo viaja con el id del evento como clave de idempotencia
      expect(logs[0].message).toContain((await outboxRows())[0].id);

      // el relay informa que sigue vivo cuando termina su primera vuelta
      const deadline = Date.now() + 6_000;
      let health = await request(app.getHttpServer()).get('/health/outbox');
      while (health.status !== 200 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 100));
        health = await request(app.getHttpServer()).get('/health/outbox');
      }
      expect(health.status).toBe(200);
    });

    it('cliente normal con subtotal bajo: paga el envío (S/ 10.00)', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);
      expect(res.body.charged).toEqual({ amount: '110.00', currency: 'PEN' });
    });

    it('cliente normal con subtotal desde S/ 150: envío gratis y sin descuento', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 2 }]),
      ).expect(201);
      expect(res.body.charged).toEqual({ amount: '200.00', currency: 'PEN' });
    });

    it('pedido en dólares: se cobra y se responde en dólares, con el envío de esa moneda', async () => {
      const customer = await insertCustomer();
      const b = await book('20.00', { currency: 'USD' });

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);

      expect(res.body.charged).toEqual({ amount: '23.00', currency: 'USD' }); // 20 + US$ 3 de envío
      expect(gateway.charges[0]).toMatchObject({
        amount: '23.00',
        currency: 'USD',
      });
      const order = await request(app.getHttpServer())
        .get(`/orders/${res.body.orderId}`)
        .set(auth)
        .expect(200);
      expect(order.body.charged.currency).toBe('USD');
      expect(order.body.lines[0].unitPrice).toEqual({
        amount: '20.00',
        currency: 'USD',
      });
    });

    it('GET /orders/:id devuelve el pedido con sus líneas', async () => {
      const customer = await insertCustomer();
      const b = await insertBook({ title: 'Refactoring', price: '60.50' });
      await insertStock(b.isbn, 5);
      const created = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 3 }]),
      ).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/orders/${created.body.orderId}`)
        .set(auth)
        .expect(200);

      expect(res.body).toEqual({
        id: created.body.orderId,
        status: 'PLACED',
        charged: created.body.charged,
        lines: [
          {
            isbn: b.isbn,
            title: 'Refactoring',
            unitPrice: { amount: '60.50', currency: 'PEN' },
            quantity: 3,
          },
        ],
      });
    });

    it('acepta el ISBN con guiones y suma las líneas repetidas del mismo libro', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const hyphenated = `${b.isbn.slice(0, 3)}-${b.isbn.slice(3)}`;

      const res = await post(
        cart(customer.id, [
          { isbn: hyphenated, quantity: 1 },
          { isbn: b.isbn, quantity: 1 },
        ]),
      ).expect(201);

      const order = await request(app.getHttpServer())
        .get(`/orders/${res.body.orderId}`)
        .set(auth)
        .expect(200);
      expect(order.body.lines).toHaveLength(1);
      expect(order.body.lines[0]).toMatchObject({ isbn: b.isbn, quantity: 2 });
    });
  });

  // ── lo que falla, y queda todo como estaba ────────────────────────────────────────────────
  describe('compras que fallan dejan todo como estaba', () => {
    it('sin stock: 422 OUT_OF_STOCK, nada cobrado ni guardado; el reintento da PREVIOUS_ATTEMPT_FAILED', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00', { stock: 1 });
      const key = randomUUID();
      const body = cart(customer.id, [{ isbn: b.isbn, quantity: 2 }]);

      const res = await post(body, key).expect(422);

      expect(res.body.errorCode).toBe('OUT_OF_STOCK');
      expect(gateway.charges).toEqual([]);
      expect(await stockOf(b.isbn)).toEqual({ available: 1, reserved: 0 });
      expect(await count('sales.orders')).toBe(0);
      const [{ order_id }] = await query<{ order_id: string }>(
        'SELECT order_id FROM sales.checkouts',
      );
      expect((await checkoutOf(order_id)).status).toBe('ABORTED');

      const retry = await post(body, key).expect(422);
      expect(retry.body.errorCode).toBe('PREVIOUS_ATTEMPT_FAILED');
    });

    it('pago rechazado (tok_declined): 422 PAYMENT_DECLINED, la reserva se libera y no hay pedido', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }], 'tok_declined'),
      ).expect(422);

      expect(res.body.errorCode).toBe('PAYMENT_DECLINED');
      expect(gateway.charges).toEqual([]);
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
      expect(await count('sales.orders')).toBe(0);
      expect(await count('messaging.outbox')).toBe(0);
    });

    it('error de la pasarela (tok_error): 500 sin detalles, compensado y checkout ABORTED', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }], 'tok_error'),
      ).expect(500);

      expect(JSON.stringify(res.body)).not.toContain('tok_error');
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
      expect(await count('sales.orders')).toBe(0);
      const [{ order_id }] = await query<{ order_id: string }>(
        'SELECT order_id FROM sales.checkouts',
      );
      expect((await checkoutOf(order_id)).status).toBe('ABORTED');
    });

    it('mezclar monedas: 422 CURRENCY_MISMATCH sin reservar ni cobrar', async () => {
      const customer = await insertCustomer();
      const pen = await book('50.00');
      const usd = await book('20.00', { currency: 'USD' });

      const res = await post(
        cart(customer.id, [
          { isbn: pen.isbn, quantity: 1 },
          { isbn: usd.isbn, quantity: 1 },
        ]),
      ).expect(422);

      expect(res.body.errorCode).toBe('CURRENCY_MISMATCH');
      expect(gateway.charges).toEqual([]);
      expect(await stockOf(pen.isbn)).toEqual({ available: 10, reserved: 0 });
      expect(await count('sales.checkouts')).toBe(0);
    });

    it('más de 10 unidades de un libro: 422 MAX_QUANTITY_EXCEEDED', async () => {
      const customer = await insertCustomer();
      const b = await book('10.00', { stock: 50 });
      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 11 }]),
      ).expect(422);
      expect(res.body.errorCode).toBe('MAX_QUANTITY_EXCEEDED');
      expect(await count('sales.checkouts')).toBe(0);
    });

    it('un ISBN mal formado: 422 INVALID_ISBN', async () => {
      const customer = await insertCustomer();
      const res = await post(
        cart(customer.id, [{ isbn: '1234567890123', quantity: 1 }]),
      ).expect(422);
      expect(res.body.errorCode).toBe('INVALID_ISBN');
    });

    it('un libro que no existe, o está inactivo: 404', async () => {
      const customer = await insertCustomer();
      const inactive = await book('10.00', { active: false });
      const unknown = '9780306406157';

      await post(cart(customer.id, [{ isbn: unknown, quantity: 1 }])).expect(
        404,
      );
      await post(
        cart(customer.id, [{ isbn: inactive.isbn, quantity: 1 }]),
      ).expect(404);
      expect(await count('sales.checkouts')).toBe(0);
    });

    it('un cliente que no existe: 404, sin efectos', async () => {
      const b = await book('10.00');
      const res = await post(
        cart(randomUUID(), [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(404);
      expect(res.body.errorCode).toBe('NOT_FOUND');
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
      expect(await count('sales.checkouts')).toBe(0);
    });
  });

  // ── idempotencia ───────────────────────────────────────────────────────────────────────────
  describe('idempotencia', () => {
    it('repetir la misma clave y el mismo carrito devuelve el mismo resultado sin cobrar de nuevo', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const key = randomUUID();
      const body = cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]);

      const first = await post(body, key).expect(201);
      const second = await post(body, key).expect(201);

      expect(second.body).toEqual(first.body);
      expect(gateway.charges).toHaveLength(1);
      expect(await count('sales.orders')).toBe(1);
      expect(await stockOf(b.isbn)).toEqual({ available: 9, reserved: 1 });
      expect(await count('messaging.outbox')).toBe(1);
    });

    it('la misma clave con otro carrito: 422 IDEMPOTENCY_KEY_REUSED y no se toca nada', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const key = randomUUID();
      await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
        key,
      ).expect(201);

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 2 }]),
        key,
      ).expect(422);

      expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(gateway.charges).toHaveLength(1);
      expect(await stockOf(b.isbn)).toEqual({ available: 9, reserved: 1 });
    });

    it('el ISBN con o sin guiones cuenta como el mismo carrito', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const key = randomUUID();
      const hyphenated = `${b.isbn.slice(0, 3)}-${b.isbn.slice(3)}`;

      const first = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
        key,
      ).expect(201);
      const second = await post(
        cart(customer.id, [{ isbn: hyphenated, quantity: 1 }]),
        key,
      ).expect(201);

      expect(second.body.orderId).toBe(first.body.orderId);
    });

    it('dos peticiones simultáneas con la misma clave: la segunda recibe 409 y, al terminar la primera, el reintento devuelve el mismo pedido', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const key = randomUUID();
      const body = cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]);
      const hold = gateway.hold(); // la primera se queda dentro del cobro

      const first = post(body, key).then((r) => r);
      await hold.entered;
      const second = await post(body, key).expect(409);
      expect(second.body.errorCode).toBe('CHECKOUT_IN_PROGRESS');

      hold.release();
      const created = await first;
      expect(created.status).toBe(201);

      const retry = await post(body, key).expect(201);
      expect(retry.body.orderId).toBe(created.body.orderId);
      expect(gateway.charges).toHaveLength(1);
      expect(await count('sales.orders')).toBe(1);
    });

    it('la última copia: dos clientes la compran a la vez y solo uno la consigue', async () => {
      const [a, b2] = await Promise.all([insertCustomer(), insertCustomer()]);
      const b = await book('100.00', { stock: 1 });

      const results = await Promise.all([
        post(cart(a.id, [{ isbn: b.isbn, quantity: 1 }])),
        post(cart(b2.id, [{ isbn: b.isbn, quantity: 1 }])),
      ]);

      const statuses = results.map((r) => r.status).sort((x, y) => x - y);
      expect(statuses).toEqual([201, 422]);
      expect(results.find((r) => r.status === 422)!.body.errorCode).toBe(
        'OUT_OF_STOCK',
      );
      expect(await stockOf(b.isbn)).toEqual({ available: 0, reserved: 1 });
      expect(await count('sales.orders')).toBe(1);
      expect(gateway.charges).toHaveLength(1);
    });
  });

  // ── X-Request-Id ───────────────────────────────────────────────────────────────────────────
  describe('X-Request-Id', () => {
    it('viaja de la petición al checkout, al evento y al email', async () => {
      const customer = await insertCustomer({ email: 'traza@example.com' });
      const b = await book('100.00');

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
        randomUUID(),
        'r-compra-7f3a',
      ).expect(201);

      expect(res.headers['x-request-id']).toBe('r-compra-7f3a');
      expect((await checkoutOf(res.body.orderId)).request_id).toBe(
        'r-compra-7f3a',
      );
      expect((await outboxRows())[0].correlation_id).toBe('r-compra-7f3a');

      await deliverEvents(2);
      const [email] = emailLogs();
      expect(email.requestId).toBe('r-compra-7f3a');
      expect(email.message).toContain('traza@example.com');
    });
  });

  // ── dirección de envío ─────────────────────────────────────────────────────────────────────
  describe('dirección de envío', () => {
    const shipColumns = async (orderId: string) =>
      (
        await query<Record<string, string | null>>(
          `SELECT ship_recipient, ship_phone, ship_line1, ship_district, ship_province, ship_department, ship_reference
           FROM sales.orders WHERE id = $1`,
          [orderId],
        )
      )[0];
    const withAddress = (
      customerId: string,
      isbn: string,
      shippingAddress: unknown,
    ) => ({ ...cart(customerId, [{ isbn, quantity: 1 }]), shippingAddress });

    it('la compra guarda la dirección en el pedido', async () => {
      const customer = await insertCustomer();
      const b = await book();

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);

      expect(await shipColumns(res.body.orderId)).toEqual({
        ship_recipient: 'María Quispe',
        ship_phone: '+51 987 654 321',
        ship_line1: 'Jr. Ucayali 150, Dpto 2',
        ship_district: 'Barranco',
        ship_province: 'Lima',
        ship_department: 'Lima',
        ship_reference: 'Casa de rejas verdes',
      });
    });

    it('guarda la dirección ya recortada, y sin referencia la deja en NULL', async () => {
      const customer = await insertCustomer();
      const b = await book();
      const { reference: _omit, ...rest } = ADDRESS_BODY;

      const res = await post(
        withAddress(customer.id, b.isbn, {
          ...rest,
          recipient: '   María Quispe  ',
        }),
      ).expect(201);

      const columns = await shipColumns(res.body.orderId);
      expect(columns.ship_recipient).toBe('María Quispe');
      expect(columns.ship_reference).toBeNull();
    });

    it('el evento del pedido es la versión 2 y lleva la dirección', async () => {
      const customer = await insertCustomer();
      const b = await book();

      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);

      const [event] = await outboxRows();
      expect(event.event_version).toBe(2);
      expect(event.aggregate_id).toBe(res.body.orderId);
      expect(event.payload).toMatchObject({ shippingAddress: ADDRESS_BODY });
    });

    it('los consumidores del evento siguen funcionando con la versión 2', async () => {
      const customer = await insertCustomer({ email: 'v2@example.com' });
      const b = await book();
      const res = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);

      await deliverEvents(2);

      expect(await reservationsOf(res.body.orderId)).toEqual([
        { isbn: b.isbn, quantity: 1, status: 'CONFIRMED' },
      ]);
      expect(emailLogs()).toHaveLength(1);
    });

    it('sin dirección: 400 y no pasa nada', async () => {
      const customer = await insertCustomer();
      const b = await book();
      const { shippingAddress: _omit, ...withoutAddress } = cart(customer.id, [
        { isbn: b.isbn, quantity: 1 },
      ]);

      await post(withoutAddress).expect(400);

      expect(await count('sales.checkouts')).toBe(0);
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('con un campo obligatorio vacío: 400', async () => {
      const customer = await insertCustomer();
      const b = await book();
      await post(
        withAddress(customer.id, b.isbn, { ...ADDRESS_BODY, district: '' }),
      ).expect(400);
      expect(await count('sales.checkouts')).toBe(0);
    });

    it('un teléfono que no es un teléfono: 422 INVALID_SHIPPING_ADDRESS, sin reservar ni cobrar', async () => {
      const customer = await insertCustomer();
      const b = await book();

      const res = await post(
        withAddress(customer.id, b.isbn, {
          ...ADDRESS_BODY,
          phone: 'llamar a María',
        }),
      ).expect(422);

      expect(res.body.errorCode).toBe('INVALID_SHIPPING_ADDRESS');
      expect(res.body.message).toContain('phone');
      expect(gateway.charges).toEqual([]);
      expect(await count('sales.checkouts')).toBe(0);
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('un salto de línea en la calle: 422 INVALID_SHIPPING_ADDRESS', async () => {
      const customer = await insertCustomer();
      const b = await book();
      const res = await post(
        withAddress(customer.id, b.isbn, {
          ...ADDRESS_BODY,
          line1: 'Jr. Ucayali\n150',
        }),
      ).expect(422);
      expect(res.body.errorCode).toBe('INVALID_SHIPPING_ADDRESS');
    });

    it('la misma clave con otra dirección: 422 IDEMPOTENCY_KEY_REUSED, y no se toca el pedido', async () => {
      const customer = await insertCustomer();
      const b = await book();
      const key = randomUUID();
      const first = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
        key,
      ).expect(201);

      const res = await post(
        withAddress(customer.id, b.isbn, {
          ...ADDRESS_BODY,
          line1: 'Otra calle 999',
        }),
        key,
      ).expect(422);

      expect(res.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await shipColumns(first.body.orderId)).ship_line1).toBe(
        'Jr. Ucayali 150, Dpto 2',
      );
      expect(gateway.charges).toHaveLength(1);
    });

    it('la misma clave con la misma dirección (con espacios de más) devuelve el mismo pedido', async () => {
      const customer = await insertCustomer();
      const b = await book();
      const key = randomUUID();
      const first = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
        key,
      ).expect(201);

      const retry = await post(
        withAddress(customer.id, b.isbn, {
          ...ADDRESS_BODY,
          recipient: '  María Quispe ',
        }),
        key,
      ).expect(201);

      expect(retry.body.orderId).toBe(first.body.orderId);
      expect(gateway.charges).toHaveLength(1);
    });

    // Decisión D2: GET /orders/:id no tiene autenticación, así que no devuelve datos personales
    it('GET /orders/:id no devuelve la dirección ni el teléfono', async () => {
      const customer = await insertCustomer();
      const b = await book();
      const created = await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
      ).expect(201);

      const res = await request(app.getHttpServer())
        .get(`/orders/${created.body.orderId}`)
        .set(auth)
        .expect(200);

      const text = JSON.stringify(res.body);
      expect(res.body).not.toHaveProperty('shippingAddress');
      for (const secret of [
        'María Quispe',
        '987 654 321',
        'Ucayali',
        'rejas verdes',
      ]) {
        expect(text).not.toContain(secret);
      }
    });

    it('la dirección no aparece en los logs, ni de la compra ni de los consumidores', async () => {
      const customer = await insertCustomer();
      const b = await book();
      await post(cart(customer.id, [{ isbn: b.isbn, quantity: 1 }])).expect(
        201,
      );
      await post(
        withAddress(customer.id, b.isbn, {
          ...ADDRESS_BODY,
          phone: 'no es un teléfono',
        }),
      ).expect(422);
      await deliverEvents(2);

      const logs = logLines.join('\n');
      for (const secret of [
        'María Quispe',
        '987 654 321',
        'Ucayali',
        'rejas verdes',
        'no es un teléfono',
      ]) {
        expect(logs).not.toContain(secret);
      }
    });
  });

  // ── forma de la petición ───────────────────────────────────────────────────────────────────
  describe('validación', () => {
    it('sin Idempotency-Key, o con uno que no es UUID: 400', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      const body = cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]);
      await post(body, null).expect(400);
      await post(body, 'no-es-uuid').expect(400);
      expect(await count('sales.checkouts')).toBe(0);
    });

    it('un cuerpo inválido o con campos de más: 400, sin efectos', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');
      await post(cart(customer.id, [])).expect(400);
      await post(cart('no-uuid', [{ isbn: b.isbn, quantity: 1 }])).expect(400);
      await post(cart(customer.id, [{ isbn: b.isbn, quantity: 0 }])).expect(
        400,
      );
      await post({
        ...cart(customer.id, [{ isbn: b.isbn, quantity: 1 }]),
        total: '1.00',
      }).expect(400);
      expect(await count('sales.checkouts')).toBe(0);
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('GET /orders/:id: 400 si el id no es un UUID y 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/orders/123')
        .set(auth)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/orders/${randomUUID()}`)
        .set(auth)
        .expect(404);
    });
  });

  // ── el token de la tarjeta ─────────────────────────────────────────────────────────────────
  describe('el token de la tarjeta', () => {
    it('no queda en ninguna tabla ni en los logs, ni en la compra exitosa ni en la fallida', async () => {
      const customer = await insertCustomer();
      const b = await book('100.00');

      await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }], TOKEN),
      ).expect(201);
      await post(
        cart(customer.id, [{ isbn: b.isbn, quantity: 1 }], 'tok_declined'),
      ).expect(422);
      await post(
        cart('no-uuid', [{ isbn: b.isbn, quantity: 1 }], TOKEN),
      ).expect(400);
      await deliverEvents(2);

      const tables = [
        'sales.checkouts',
        'sales.orders',
        'sales.order_lines',
        'messaging.outbox',
        'messaging.deliveries',
        'inventory.reservations',
      ];
      for (const table of tables) {
        const rows = await query<{ row: string }>(
          `SELECT t::text AS row FROM ${table} t`,
        );
        expect(rows.map((r) => r.row).join('\n')).not.toContain(TOKEN);
      }
      expect(logLines.join('\n')).not.toContain(TOKEN);
      expect(JSON.stringify(gateway.charges)).not.toContain(TOKEN);
    });
  });
});
