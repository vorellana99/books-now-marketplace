import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
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
        AUTH_MODULE,
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
  const book = async (
    price = '100.00',
    currency: 'PEN' | 'USD' = 'PEN',
    stock = 10,
  ) => {
    const b = await insertBook({ price, currency });
    await insertStock(b.isbn, stock);
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

  // El «listo cuando» del corte 8: lo que se cotiza es lo que se cobra
  describe('el total cotizado es el cobrado', () => {
    const ADDRESS = {
      recipient: 'María Quispe',
      phone: '+51 987 654 321',
      line1: 'Jr. Ucayali 150, Dpto 2',
      district: 'Barranco',
      province: 'Lima',
      department: 'Lima',
    };
    // Un comprador con su cliente en Ventas, sin pasar por el registro (aquí no se prueba la sesión)
    async function customer(premium: boolean) {
      const id = randomUUID();
      await query(
        'INSERT INTO sales.customers (id, email, premium) VALUES ($1, $2, $3)',
        [id, `${id}@example.com`, premium],
      );
      return { id, auth: await bearer(app, 'BUYER', id) };
    }
    const buy = (auth: Record<string, string>, items: unknown[]) =>
      http()
        .post('/orders')
        .set(auth)
        .set('Idempotency-Key', randomUUID())
        .send({ cardToken: 'tok_visa', items, shippingAddress: ADDRESS });

    it.each([
      [
        'PEN normal 100',
        false,
        '100.00',
        'PEN',
        ['100.00', '0.00', '10.00', '110.00'],
      ],
      [
        'PEN normal 160',
        false,
        '160.00',
        'PEN',
        ['160.00', '0.00', '0.00', '160.00'],
      ],
      [
        'PEN premium 100',
        true,
        '100.00',
        'PEN',
        ['100.00', '10.00', '0.00', '90.00'],
      ],
      [
        'PEN premium 200',
        true,
        '200.00',
        'PEN',
        ['200.00', '20.00', '0.00', '180.00'],
      ],
      [
        'USD normal 20',
        false,
        '20.00',
        'USD',
        ['20.00', '0.00', '3.00', '23.00'],
      ],
      [
        'USD normal 50',
        false,
        '50.00',
        'USD',
        ['50.00', '0.00', '0.00', '50.00'],
      ],
      [
        'USD premium 20',
        true,
        '20.00',
        'USD',
        ['20.00', '2.00', '0.00', '18.00'],
      ],
      [
        'USD premium 100',
        true,
        '100.00',
        'USD',
        ['100.00', '10.00', '0.00', '90.00'],
      ],
    ] as const)('%s', async (_name, premium, price, currency, parts) => {
      const c = await customer(premium);
      const b = await book(price, currency);
      const items = [{ isbn: b.isbn, quantity: 1 }];

      const quoted = (await quote(c.auth, { items }).expect(200)).body;
      const charged = (await buy(c.auth, items).expect(201)).body.charged;

      expect([
        quoted.subtotal.amount,
        quoted.discount.amount,
        quoted.shipping.amount,
        quoted.total.amount,
      ]).toEqual([...parts]);
      expect(quoted.total).toEqual(charged);
      expect(quoted.total.currency).toBe(currency);
    });

    it('con varias líneas y precios que obligan a redondear, también', async () => {
      const luis = await customer(true);
      const ana = await customer(false);
      // Stock de sobra: aquí se prueba el precio, no la falta de unidades
      const [a, b] = [
        await book('9.99', 'PEN', 100),
        await book('0.15', 'PEN', 100),
      ];
      const carts = [
        [luis, [{ isbn: a.isbn, quantity: 1 }]],
        [luis, [{ isbn: b.isbn, quantity: 1 }]],
        [ana, [{ isbn: b.isbn, quantity: 3 }]],
        [
          ana,
          [
            { isbn: a.isbn, quantity: 2 },
            { isbn: b.isbn, quantity: 7 },
          ],
        ],
        [
          luis,
          [
            { isbn: b.isbn, quantity: 9 },
            { isbn: a.isbn, quantity: 4 },
            { isbn: b.isbn, quantity: 1 },
          ],
        ],
      ] as const;

      for (const [c, items] of carts) {
        const quoted = (await quote(c.auth, { items }).expect(200)).body;
        const charged = (await buy(c.auth, [...items]).expect(201)).body
          .charged;
        expect(quoted.total).toEqual(charged);
        // las partes que se muestran suman el total que se muestra
        const cents = (m: { amount: string }) =>
          Math.round(Number(m.amount) * 100);
        expect(
          cents(quoted.subtotal) -
            cents(quoted.discount) +
            cents(quoted.shipping),
        ).toBe(cents(quoted.total));
      }
    });

    it('si cambia un precio entre cotizar y pagar, manda el cobrado (RN-08)', async () => {
      const c = await customer(false);
      const b = await book('45.00');
      const items = [{ isbn: b.isbn, quantity: 1 }];
      const before = (await quote(c.auth, { items }).expect(200)).body;
      await query('UPDATE catalog.books SET price = 50.00 WHERE isbn = $1', [
        b.isbn,
      ]);

      const charged = (await buy(c.auth, items).expect(201)).body.charged;
      const after = (await quote(c.auth, { items }).expect(200)).body;

      expect(before.total.amount).toBe('55.00'); // 45 + 10 de envío
      expect(charged.amount).toBe('60.00'); // 50 + 10: el precio de hoy
      expect(after.total).toEqual(charged); // la nueva cotización ya coincide
    });
  });
});
