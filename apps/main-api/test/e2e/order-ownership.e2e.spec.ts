import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { bearer, signUp as signUpOn } from '../support/auth.js';
import { insertBook, insertStock, stockOf } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const ADDRESS = {
  recipient: 'María Quispe',
  phone: '+51 987 654 321',
  line1: 'Jr. Ucayali 150, Dpto 2',
  district: 'Barranco',
  province: 'Lima',
  department: 'Lima',
};
const count = async (table: string) =>
  Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n,
  );

// Sin ScheduleModule: el relay no corre solo, así que la ventana entre registrarse y tener cliente es controlable
describe('Compra autenticada y pedidos de cada quien (e2e, aplicación y PostgreSQL reales)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;

  beforeAll(async () => {
    app = await createHttpApp(
      [
        OutboxModule,
        CatalogModule,
        InventoryModule,
        SalesModule,
        IdentityModule,
      ],
      { PAYMENT_PROVIDER: 'fake' },
    );
    relay = app.get(OutboxRelay);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const http = () => request(app.getHttpServer());
  const signUp = (email: string) => signUpOn(app, email);

  const cartFor = (isbn: string, quantity = 1) => ({
    cardToken: 'tok_visa',
    items: [{ isbn, quantity }],
    shippingAddress: ADDRESS,
  });
  const buy = (
    auth: Record<string, string>,
    isbn: string,
    key: string = randomUUID(),
    body: Record<string, unknown> = cartFor(isbn),
  ) => http().post('/orders').set(auth).set('Idempotency-Key', key).send(body);
  async function bookInStock(stock = 10) {
    const book = await insertBook({ price: '100.00' });
    await insertStock(book.isbn, stock);
    return book;
  }

  describe('POST /orders', () => {
    it('registrarse, iniciar sesión y comprar: el pedido es del cliente del token', async () => {
      const ana = await signUp('ana@example.com');
      await relay.runOnce(); // Ventas crea al cliente al recibir el evento
      const book = await bookInStock();

      const res = await buy(ana.auth, book.isbn).expect(201);

      const [order] = await query<{ customer_id: string }>(
        'SELECT customer_id FROM sales.orders',
      );
      expect(order.customer_id).toBe(ana.id);
      expect(res.body.orderId).toEqual(expect.any(String));
    });

    it('cada comprador compra a su nombre, aunque lo hagan a la vez', async () => {
      const [ana, luis] = [
        await signUp('ana@example.com'),
        await signUp('luis@example.com'),
      ];
      await relay.runOnce();
      const book = await bookInStock();

      const [a, l] = await Promise.all([
        buy(ana.auth, book.isbn).expect(201),
        buy(luis.auth, book.isbn).expect(201),
      ]);

      const owners = await query<{ id: string; customer_id: string }>(
        'SELECT id, customer_id FROM sales.orders',
      );
      expect(owners.find((o) => o.id === a.body.orderId)?.customer_id).toBe(
        ana.id,
      );
      expect(owners.find((o) => o.id === l.body.orderId)?.customer_id).toBe(
        luis.id,
      );
    });

    it('un customerId en el cuerpo (el suyo o el de otro) es 400 y no compra nada', async () => {
      const [ana, luis] = [
        await signUp('ana@example.com'),
        await signUp('luis@example.com'),
      ];
      await relay.runOnce();
      const book = await bookInStock();

      for (const customerId of [ana.id, luis.id, randomUUID()]) {
        const res = await buy(ana.auth, book.isbn, randomUUID(), {
          ...cartFor(book.isbn),
          customerId,
        }).expect(400);
        expect(JSON.stringify(res.body)).toMatch(/customerId/);
      }

      expect(await count('sales.orders')).toBe(0);
      expect(await count('sales.checkouts')).toBe(0);
      expect(await stockOf(book.isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('sin token: 401; un administrador no compra: 403; ninguno toca nada', async () => {
      const book = await bookInStock();

      await http()
        .post('/orders')
        .set('Idempotency-Key', randomUUID())
        .send(cartFor(book.isbn))
        .expect(401);
      const admin = await buy(await bearer(app, 'ADMIN'), book.isbn).expect(
        403,
      );
      expect(admin.body.errorCode).toBe('FORBIDDEN');

      expect(await count('sales.checkouts')).toBe(0);
      expect(await stockOf(book.isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('recién registrado, antes de que Ventas cree al cliente: 404 NOT_FOUND sin efectos; al reintentar después, compra', async () => {
      const ana = await signUp('ana@example.com');
      const book = await bookInStock();

      const early = await buy(ana.auth, book.isbn).expect(404);
      expect(early.body.errorCode).toBe('NOT_FOUND');
      expect(await count('sales.checkouts')).toBe(0);
      expect(await stockOf(book.isbn)).toEqual({ available: 10, reserved: 0 });

      await relay.runOnce();

      await buy(ana.auth, book.isbn).expect(201);
    });
  });

  describe('GET /orders/:id', () => {
    async function anaOrder() {
      const [ana, luis] = [
        await signUp('ana@example.com'),
        await signUp('luis@example.com'),
      ];
      await relay.runOnce();
      const book = await bookInStock();
      const orderId = (await buy(ana.auth, book.isbn).expect(201)).body
        .orderId as string;
      return { ana, luis, book, orderId };
    }

    it('su dueño lo ve', async () => {
      const { ana, orderId } = await anaOrder();

      const res = await http()
        .get(`/orders/${orderId}`)
        .set(ana.auth)
        .expect(200);

      expect(res.body.id).toBe(orderId);
    });

    it('un administrador ve el de cualquiera', async () => {
      const { orderId } = await anaOrder();
      await http()
        .get(`/orders/${orderId}`)
        .set(await bearer(app, 'ADMIN'))
        .expect(200);
    });

    it('otro comprador recibe 404, el mismo cuerpo que un pedido que no existe', async () => {
      const { luis, orderId } = await anaOrder();
      const missing = randomUUID();

      const foreign = await http()
        .get(`/orders/${orderId}`)
        .set(luis.auth)
        .expect(404);
      const none = await http()
        .get(`/orders/${missing}`)
        .set(luis.auth)
        .expect(404);

      expect(foreign.body).toEqual({
        ...none.body,
        message: none.body.message.replace(missing, orderId),
      });
      expect(foreign.text).not.toContain('Ana');
      expect(foreign.body.errorCode).toBe('NOT_FOUND');
    });

    it('sin token: 401, también para un pedido que existe', async () => {
      const { orderId } = await anaOrder();
      await http().get(`/orders/${orderId}`).expect(401);
    });
  });

  describe('la clave de idempotencia es global', () => {
    it('otro comprador que usa la clave de Ana con el mismo carrito recibe IDEMPOTENCY_KEY_REUSED y no ve su pedido', async () => {
      const [ana, luis] = [
        await signUp('ana@example.com'),
        await signUp('luis@example.com'),
      ];
      await relay.runOnce();
      const book = await bookInStock();
      const key = randomUUID();
      const first = await buy(ana.auth, book.isbn, key).expect(201);

      const stolen = await buy(luis.auth, book.isbn, key).expect(422);

      expect(stolen.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(stolen.text).not.toContain(first.body.orderId);
      expect(await count('sales.orders')).toBe(1);
      expect(await stockOf(book.isbn)).toEqual({ available: 9, reserved: 1 });

      // Ana, que repite su compra, recibe su mismo pedido y no se cobra otra vez
      const again = await buy(ana.auth, book.isbn, key);
      expect(again.body.orderId).toBe(first.body.orderId);
      expect(await count('sales.orders')).toBe(1);
    });
  });
});
