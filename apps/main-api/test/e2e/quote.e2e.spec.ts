import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { bearer, signUp } from '../support/auth.js';
import { insertBook, insertStock, stockOf } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const rows = async (table: string) =>
  Number(
    (await query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0].n,
  );

// Sin ScheduleModule: el relay no corre solo, así que la ventana entre registrarse y tener cliente es controlable
describe('POST /orders/quote (e2e, aplicación y PostgreSQL reales)', () => {
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
  const quote = (auth: Record<string, string>, body: unknown) =>
    http()
      .post('/orders/quote')
      .set(auth)
      .send(body as object);
  async function buyer(email = 'ana@example.com') {
    const session = await signUp(app, email);
    await relay.runOnce(); // Ventas crea al cliente al recibir el evento del registro
    return session;
  }
  const book = async (price = '100.00', currency: 'PEN' | 'USD' = 'PEN') => {
    const b = await insertBook({ price, currency });
    await insertStock(b.isbn, 10);
    return b;
  };

  describe('quién puede cotizar', () => {
    it('sin token: 401', async () => {
      const b = await book();
      const res = await http()
        .post('/orders/quote')
        .send({ items: [{ isbn: b.isbn, quantity: 1 }] })
        .expect(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('un administrador no es un cliente: 403', async () => {
      const b = await book();
      const res = await quote(await bearer(app, 'ADMIN'), {
        items: [{ isbn: b.isbn, quantity: 1 }],
      }).expect(403);
      expect(res.body.errorCode).toBe('FORBIDDEN');
    });
  });

  describe('la respuesta', () => {
    it('200 con el desglose, las líneas y los montos como texto de 2 decimales', async () => {
      const ana = await buyer();
      const b = await book('45.00');

      const res = await quote(ana.auth, {
        items: [{ isbn: b.isbn, quantity: 2 }],
      }).expect(200);

      expect(res.body).toEqual({
        currency: 'PEN',
        lines: [
          {
            isbn: b.isbn,
            unitPrice: { amount: '45.00', currency: 'PEN' },
            quantity: 2,
            subtotal: { amount: '90.00', currency: 'PEN' },
          },
        ],
        subtotal: { amount: '90.00', currency: 'PEN' },
        discount: { amount: '0.00', currency: 'PEN' },
        shipping: { amount: '10.00', currency: 'PEN' },
        total: { amount: '100.00', currency: 'PEN' },
      });
    });

    it('el descuento premium sale del cliente del token', async () => {
      const luis = await buyer('luis@example.com');
      await query('UPDATE sales.customers SET premium = true WHERE id = $1', [
        luis.id,
      ]);
      const b = await book('100.00');

      const res = await quote(luis.auth, {
        items: [{ isbn: b.isbn, quantity: 1 }],
      }).expect(200);

      expect(res.body.discount.amount).toBe('10.00');
      expect(res.body.shipping.amount).toBe('0.00');
      expect(res.body.total.amount).toBe('90.00');
    });

    it('en dólares, con el envío de esa moneda', async () => {
      const ana = await buyer();
      const b = await book('20.00', 'USD');

      const res = await quote(ana.auth, {
        items: [{ isbn: b.isbn, quantity: 1 }],
      }).expect(200);

      expect(res.body.currency).toBe('USD');
      expect(res.body.shipping).toEqual({ amount: '3.00', currency: 'USD' });
      expect(res.body.total).toEqual({ amount: '23.00', currency: 'USD' });
    });

    it('las líneas salen ordenadas por ISBN, con las repetidas sumadas (también con guiones)', async () => {
      const ana = await buyer();
      const [a, b] = [await book('10.00'), await book('5.00')];
      const hyphenated = `${a.isbn.slice(0, 3)}-${a.isbn.slice(3)}`;

      const res = await quote(ana.auth, {
        items: [
          { isbn: b.isbn, quantity: 1 },
          { isbn: a.isbn, quantity: 2 },
          { isbn: hyphenated, quantity: 3 },
        ],
      }).expect(200);

      const isbns = res.body.lines.map((l: { isbn: string }) => l.isbn);
      expect(isbns).toEqual([a.isbn, b.isbn].sort());
      const lineA = res.body.lines.find(
        (l: { isbn: string }) => l.isbn === a.isbn,
      );
      expect(lineA.quantity).toBe(5);
      expect(lineA.subtotal.amount).toBe('50.00');
      expect(res.body.subtotal.amount).toBe('55.00');
    });

    it('no se guarda en cachés', async () => {
      const ana = await buyer();
      const b = await book();
      const res = await quote(ana.auth, {
        items: [{ isbn: b.isbn, quantity: 1 }],
      }).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('no cobra ni reserva ni guarda', () => {
    it('tras cotizar no hay checkout, pedido, reserva ni evento nuevo, y el stock es el mismo', async () => {
      const ana = await buyer();
      const b = await book('45.00');
      const events = await rows('messaging.outbox'); // el del registro

      await quote(ana.auth, { items: [{ isbn: b.isbn, quantity: 3 }] }).expect(
        200,
      );

      for (const table of [
        'sales.checkouts',
        'sales.orders',
        'sales.order_lines',
        'inventory.reservations',
      ]) {
        expect(await rows(table), table).toBe(0);
      }
      expect(await rows('messaging.outbox')).toBe(events);
      expect(await stockOf(b.isbn)).toEqual({ available: 10, reserved: 0 });
    });

    it('no exige Idempotency-Key', async () => {
      const ana = await buyer();
      const b = await book();
      await quote(ana.auth, { items: [{ isbn: b.isbn, quantity: 1 }] }).expect(
        200,
      );
    });
  });

  describe('lo que se rechaza', () => {
    it.each([
      ['un customerId', { customerId: randomUUID() }],
      ['una dirección', { shippingAddress: { recipient: 'x' } }],
      ['un token de tarjeta', { cardToken: 'tok_visa' }],
      ['un total', { total: '1.00' }],
    ])('%s en el cuerpo: 400', async (_name, extra) => {
      const ana = await buyer();
      const b = await book();
      const res = await quote(ana.auth, {
        items: [{ isbn: b.isbn, quantity: 1 }],
        ...extra,
      }).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/should not exist/);
    });

    it.each([
      ['un carrito vacío', { items: [] }],
      ['sin items', {}],
      ['una cantidad 0', { items: [{ isbn: '9780132350884', quantity: 0 }] }],
    ])('%s: 400', async (_name, body) => {
      const ana = await buyer();
      await quote(ana.auth, body).expect(400);
    });

    it('un libro que no existe o está inactivo: 404 NOT_FOUND', async () => {
      const ana = await buyer();
      const inactive = await insertBook({ active: false });

      for (const isbn of ['9780306406157', inactive.isbn]) {
        const res = await quote(ana.auth, {
          items: [{ isbn, quantity: 1 }],
        }).expect(404);
        expect(res.body.errorCode).toBe('NOT_FOUND');
      }
    });

    it('un ISBN mal formado: 422 INVALID_ISBN', async () => {
      const ana = await buyer();
      const res = await quote(ana.auth, {
        items: [{ isbn: '1234567890123', quantity: 1 }],
      }).expect(422);
      expect(res.body.errorCode).toBe('INVALID_ISBN');
    });

    it('monedas mezcladas: 422 CURRENCY_MISMATCH', async () => {
      const ana = await buyer();
      const [pen, usd] = [
        await book('10.00', 'PEN'),
        await book('10.00', 'USD'),
      ];
      const res = await quote(ana.auth, {
        items: [
          { isbn: pen.isbn, quantity: 1 },
          { isbn: usd.isbn, quantity: 1 },
        ],
      }).expect(422);
      expect(res.body.errorCode).toBe('CURRENCY_MISMATCH');
    });

    it('más de 10 unidades de un libro: 422 MAX_QUANTITY_EXCEEDED', async () => {
      const ana = await buyer();
      const b = await book();
      const res = await quote(ana.auth, {
        items: [{ isbn: b.isbn, quantity: 11 }],
      }).expect(422);
      expect(res.body.errorCode).toBe('MAX_QUANTITY_EXCEEDED');
    });

    it('recién registrado, antes de que Ventas cree al cliente: 404 NOT_FOUND', async () => {
      const ana = await signUp(app, 'nueva@example.com');
      const b = await book();

      const res = await quote(ana.auth, {
        items: [{ isbn: b.isbn, quantity: 1 }],
      }).expect(404);

      expect(res.body.errorCode).toBe('NOT_FOUND');
    });
  });
});
