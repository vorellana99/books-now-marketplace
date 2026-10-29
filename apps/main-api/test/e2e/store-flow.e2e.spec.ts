import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { HealthModule } from '../../src/platform/health/health.module.js';
import { RequestAwareLogger } from '../../src/platform/observability/request-aware.logger.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { bearer } from '../support/auth.js';
import {
  deliveryRows,
  insertCustomer,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

// El "listo cuando" del corte 6, de punta a punta: el administrador da de alta un libro y le carga stock, el cliente lo
// busca y lo compra con su dirección, y el historial de administración lo muestra. La misma composición que AppModule
// (relay incluido, que corre solo cada segundo), con la administración abierta o cerrada
const MODULES = () => [
  OutboxModule,
  ScheduleModule.forRoot(),
  HealthModule,
  CatalogModule,
  InventoryModule,
  SalesModule,
  IdentityModule, // el guard global: las rutas exigen sesión
];
const ISBN = '9780134494166';
const BOOK = {
  isbn: ISBN,
  title: 'Clean Architecture',
  author: 'Robert C. Martin',
  price: { amount: '55.00', currency: 'PEN' },
};
const ADDRESS = {
  recipient: 'María Quispe',
  phone: '+51 987 654 321',
  line1: 'Jr. Ucayali 150, Dpto 2',
  district: 'Barranco',
  province: 'Lima',
  department: 'Lima',
  reference: 'Casa de rejas verdes',
};

// Quién llama: el administrador, y cada comprador con su token (el cliente de la compra es el del token)
let currentApp: INestApplication;
let adminHeader: { Authorization: string };
const buyers = new Map<string, { Authorization: string }>();
const newCustomer = async (
  overrides: Parameters<typeof insertCustomer>[0] = {},
) => {
  const customer = await insertCustomer(overrides);
  buyers.set(customer.id, await bearer(currentApp, 'BUYER', customer.id));
  return customer;
};

async function waitFor(done: () => Promise<boolean>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error('se agotó la espera');
    await new Promise((r) => setTimeout(r, 100));
  }
}

describe('El flujo de la tienda de punta a punta (e2e, aplicación completa y PostgreSQL real)', () => {
  describe('con un administrador', () => {
    let app: INestApplication;
    let relay: OutboxRelay;
    let logLines: string[];

    beforeAll(async () => {
      app = await createHttpApp(MODULES(), {
        PAYMENT_PROVIDER: 'fake',
      });
      currentApp = app;
      adminHeader = await bearer(app, 'ADMIN');
      app.useLogger(new RequestAwareLogger({ json: true }));
      relay = app.get(OutboxRelay);
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(async () => {
      await resetDatabase();
      logLines = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        logLines.push(String(chunk));
        return true;
      });
    });
    afterEach(() => vi.restoreAllMocks());

    const http = () => request(app.getHttpServer());
    const createBook = (overrides: Record<string, unknown> = {}) =>
      http()
        .post('/admin/books')
        .set(adminHeader)
        .send({ ...BOOK, ...overrides });
    const addStock = (quantity: number, isbn = ISBN) =>
      http()
        .post(`/admin/stock/${isbn}/additions`)
        .set(adminHeader)
        .send({ quantity });
    const buy = (
      customerId: string,
      quantity = 1,
      options: { key?: string; isbn?: string } = {},
    ) =>
      http()
        .post('/orders')
        .set(buyers.get(customerId)!)
        .set('Idempotency-Key', options.key ?? randomUUID())
        .send({
          cardToken: 'tok_visa',
          items: [{ isbn: options.isbn ?? ISBN, quantity }],
          shippingAddress: ADDRESS,
        });
    const stockReady = () => async () => (await stockOf(ISBN)) !== undefined;

    it('alta, stock, búsqueda, compra, historial: el libro nuevo se vende de verdad', async () => {
      const ana = await newCustomer({ email: 'ana@example.com' });

      // 1. El administrador da de alta el libro
      const created = await createBook().expect(201);
      expect(created.body).toEqual({ ...BOOK, active: true });

      // 2. Inventario le crea su stock en cero al recibir el evento (el relay corre solo)
      await waitFor(stockReady());
      expect(await stockOf(ISBN)).toEqual({ available: 0, reserved: 0 });

      // 3. El cliente lo encuentra
      const search = await http().get('/books?q=architecture').expect(200);
      expect(search.body.items.map((b: { isbn: string }) => b.isbn)).toEqual([
        ISBN,
      ]);

      // 4. Sin unidades todavía no se puede comprar, y no se cobra nada
      const early = await buy(ana.id).expect(422);
      expect(early.body.errorCode).toBe('OUT_OF_STOCK');

      // 5. El administrador carga stock
      const loaded = await addStock(5).expect(201);
      expect(loaded.body).toEqual({ isbn: ISBN, available: 5, reserved: 0 });

      // 6. Ahora sí se compra: 2 × 55.00 = 110.00, por debajo del mínimo de envío gratis (150.00), más 10.00 de envío
      const bought = await buy(ana.id, 2).expect(201);
      expect(bought.body.charged).toEqual({
        amount: '120.00',
        currency: 'PEN',
      });
      expect(await stockOf(ISBN)).toEqual({ available: 3, reserved: 2 });

      // 7. El evento v2 llega a sus consumidores: la reserva queda confirmada y el correo sale
      // Hay tres entregas (la del libro y las dos del pedido): se espera lo que se va a comprobar, no un número de ellas
      await waitFor(
        async () =>
          (await reservationsOf(bought.body.orderId))[0]?.status ===
            'CONFIRMED' &&
          logLines.join('\n').includes('Email a ana@example.com'),
      );
      expect(await reservationsOf(bought.body.orderId)).toEqual([
        { isbn: ISBN, quantity: 2, status: 'CONFIRMED' },
      ]);
      expect(logLines.join('\n')).toContain('Email a ana@example.com');

      // 8. El historial de administración lo muestra, con la dirección; la consulta pública, sin ella
      const history = await http()
        .get(`/admin/orders?customerId=${ana.id}`)
        .set(adminHeader)
        .expect(200);
      expect(history.body.items).toHaveLength(1);
      expect(history.body.items[0]).toMatchObject({
        id: bought.body.orderId,
        charged: { amount: '120.00', currency: 'PEN' },
        shippingAddress: ADDRESS,
      });
      const single = await http()
        .get(`/orders/${bought.body.orderId}`)
        .set(adminHeader)
        .expect(200);
      expect(single.body).not.toHaveProperty('shippingAddress');
      expect(JSON.stringify(single.body)).not.toContain('Quispe');
    });

    it('un cambio de precio vale para las compras siguientes y no toca las ya hechas', async () => {
      const ana = await newCustomer();
      await createBook().expect(201);
      await waitFor(stockReady());
      await addStock(10).expect(201);
      const first = await buy(ana.id, 1).expect(201);
      expect(first.body.charged.amount).toBe('65.00'); // 55.00 + 10.00 de envío

      await http()
        .patch(`/admin/books/${ISBN}`)
        .set(adminHeader)
        .send({ price: { amount: '70.00' } })
        .expect(200);
      const second = await buy(ana.id, 1).expect(201);

      expect(second.body.charged.amount).toBe('80.00'); // 70.00 + 10.00
      const old = await http()
        .get(`/orders/${first.body.orderId}`)
        .set(adminHeader)
        .expect(200);
      expect(old.body.lines[0].unitPrice).toEqual({
        amount: '55.00',
        currency: 'PEN',
      });
    });

    it('desactivar un libro lo saca del catálogo y de las compras sin perder sus pedidos; reactivarlo lo devuelve', async () => {
      const ana = await newCustomer();
      await createBook().expect(201);
      await waitFor(stockReady());
      await addStock(10).expect(201);
      const bought = await buy(ana.id, 1).expect(201);

      await http()
        .patch(`/admin/books/${ISBN}`)
        .set(adminHeader)
        .send({ active: false })
        .expect(200);

      await http().get(`/books/${ISBN}`).expect(404);
      expect(
        (await http().get('/books?q=architecture').expect(200)).body.total,
      ).toBe(0);
      const refused = await buy(ana.id, 1).expect(404);
      expect(refused.body.errorCode).toBe('NOT_FOUND');
      await http()
        .get(`/orders/${bought.body.orderId}`)
        .set(adminHeader)
        .expect(200); // el pedido ya hecho se sigue leyendo
      expect(
        (
          await http()
            .get(`/admin/orders?customerId=${ana.id}`)
            .set(adminHeader)
            .expect(200)
        ).body.items,
      ).toHaveLength(1);
      expect((await stockOf(ISBN))?.reserved).toBe(1); // el stock no se tocó

      await http()
        .patch(`/admin/books/${ISBN}`)
        .set(adminHeader)
        .send({ active: true })
        .expect(200);
      await http().get(`/books/${ISBN}`).expect(200);
      await buy(ana.id, 1).expect(201);
    });

    it('la última unidad cargada se la lleva uno solo de dos clientes que compran a la vez', async () => {
      const [ana, luis] = await Promise.all([newCustomer(), newCustomer()]);
      await createBook().expect(201);
      await waitFor(stockReady());
      await addStock(1).expect(201);

      const results = await Promise.all([buy(ana.id), buy(luis.id)]);

      expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
        201, 422,
      ]);
      expect(await stockOf(ISBN)).toEqual({ available: 0, reserved: 1 });
    });

    it('cargar stock mientras se compra no pierde ninguna unidad', async () => {
      const customers = await Promise.all(
        [1, 2, 3, 4].map(() => newCustomer()),
      );
      await createBook().expect(201);
      await waitFor(stockReady());
      await addStock(4).expect(201);

      const results = await Promise.all([
        ...customers.map((c) => buy(c.id)),
        addStock(6),
        addStock(6),
      ]);

      expect(results.filter((r) => r.status >= 400)).toEqual([]);
      // Había 4; se suman 6 + 6 y se reservan 4: quedan 4 + 12 − 4 = 12 disponibles y 4 reservadas
      expect(await stockOf(ISBN)).toEqual({ available: 12, reserved: 4 });
    });

    it('el historial recorre varios pedidos de un cliente por páginas, del más reciente al más antiguo', async () => {
      const ana = await newCustomer();
      await createBook().expect(201);
      await waitFor(stockReady());
      await addStock(10).expect(201);
      const orderIds: string[] = [];
      for (let i = 0; i < 3; i++)
        orderIds.push((await buy(ana.id).expect(201)).body.orderId);

      const first = await http()
        .get(`/admin/orders?customerId=${ana.id}&limit=2`)
        .set(adminHeader)
        .expect(200);
      const second = await http()
        .get(
          `/admin/orders?customerId=${ana.id}&limit=2&cursor=${first.body.nextCursor}`,
        )
        .set(adminHeader)
        .expect(200);

      const seen = [...first.body.items, ...second.body.items].map(
        (o: { id: string }) => o.id,
      );
      expect(seen).toEqual([...orderIds].reverse());
      expect(second.body.nextCursor).toBeNull();
    });

    it('una segunda alta del mismo libro da 409 y no duplica nada', async () => {
      await createBook().expect(201);
      await createBook({ title: 'Otro' }).expect(409);
      await waitFor(stockReady());
      expect(
        (
          await query<{ n: string }>('SELECT count(*) AS n FROM catalog.books')
        )[0].n,
      ).toBe('1');
      expect(
        (
          await query<{ n: string }>(
            'SELECT count(*) AS n FROM inventory.stock_items',
          )
        )[0].n,
      ).toBe('1');
    });

    it('el monitoreo sigue en verde durante todo el flujo: /health/outbox responde 200', async () => {
      await createBook().expect(201);
      await waitFor(stockReady());
      await waitFor(
        async () => (await http().get('/health/outbox')).status === 200,
      );
      const health = await http().get('/health/outbox').expect(200);
      expect(health.body.info.outbox.failed).toBe(0);
    });

    it('el relay entrega los eventos de libro y de pedido sin dejar nada en FAILED', async () => {
      const ana = await newCustomer();
      await createBook().expect(201);
      await waitFor(stockReady());
      await addStock(2).expect(201);
      await buy(ana.id).expect(201);
      await waitFor(
        async () =>
          (await deliveryRows()).length === 3 &&
          (await deliveryRows()).every((d) => d.status === 'DONE'),
      );
      await relay.runOnce();
      expect(
        (await deliveryRows())
          .map((d) => d.consumer)
          .sort((a, b) => a.localeCompare(b)),
      ).toEqual([
        'inventory.confirm-reservation',
        'inventory.create-stock-item',
        'sales.send-order-confirmation',
      ]);
    });
  });

  describe('quién puede entrar', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp(MODULES(), {
        PAYMENT_PROVIDER: 'fake',
      });
      currentApp = app;
      adminHeader = await bearer(app, 'ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);
    const http = () => request(app.getHttpServer());

    const adminCalls = (
      ana: { id: string },
      headers: Record<string, string>,
    ) => [
      () => http().post('/admin/books').set(headers).send(BOOK),
      () =>
        http()
          .patch(`/admin/books/${ISBN}`)
          .set(headers)
          .send({ active: false }),
      () =>
        http()
          .post(`/admin/stock/${ISBN}/additions`)
          .set(headers)
          .send({ quantity: 5 }),
      () => http().get(`/admin/orders?customerId=${ana.id}`).set(headers),
    ];
    const noBooks = async () =>
      (await query<{ n: string }>('SELECT count(*) AS n FROM catalog.books'))[0]
        .n;

    it('sin token toda la administración responde 401, y no se crea nada', async () => {
      const ana = await newCustomer();
      for (const call of adminCalls(ana, {})) {
        const res = await call().expect(401);
        expect(res.body.errorCode).toBe('UNAUTHENTICATED');
      }
      expect(await noBooks()).toBe('0');
    });

    it('un comprador recibe 403 en toda la administración, y no se crea nada', async () => {
      const ana = await newCustomer();
      for (const call of adminCalls(ana, buyers.get(ana.id)!)) {
        const res = await call().expect(403);
        expect(res.body.errorCode).toBe('FORBIDDEN');
      }
      expect(await noBooks()).toBe('0');
    });

    it('lo público sigue funcionando: catálogo, búsqueda y compra', async () => {
      const ana = await newCustomer();
      await query(
        "INSERT INTO catalog.books (isbn, title, author, price, currency, active) VALUES ($1, 'Clean Architecture', 'Robert C. Martin', 55.00, 'PEN', true)",
        [ISBN],
      );
      await query(
        'INSERT INTO inventory.stock_items (isbn, available, reserved) VALUES ($1, 5, 0)',
        [ISBN],
      );

      await http().get(`/books/${ISBN}`).expect(200);
      expect(
        (await http().get('/books?q=architecture').expect(200)).body.total,
      ).toBe(1);
      await http()
        .post('/orders')
        .set(buyers.get(ana.id)!)
        .set('Idempotency-Key', randomUUID())
        .send({
          cardToken: 'tok_visa',
          items: [{ isbn: ISBN, quantity: 1 }],
          shippingAddress: ADDRESS,
        })
        .expect(201);
    });

    it('la documentación muestra las rutas de administración, con la etiqueta admin, y las públicas', async () => {
      const res = await http().get('/docs-json').expect(200);
      const adminPaths = Object.keys(res.body.paths).filter((p) =>
        p.startsWith('/admin'),
      );
      expect(adminPaths.sort((x, y) => x.localeCompare(y))).toEqual([
        '/admin/books',
        '/admin/books/{isbn}',
        '/admin/orders',
        '/admin/stock/{isbn}/additions',
      ]);
      expect(res.body.paths['/orders'].get).toBeUndefined();
      expect(res.body.paths['/orders'].post).toBeDefined();
      expect(res.body.paths['/books'].get).toBeDefined();
    });
  });
});
