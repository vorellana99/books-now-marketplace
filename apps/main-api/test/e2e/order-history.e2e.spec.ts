import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { bearer } from '../support/auth.js';
import { insertCustomer, insertOrder } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const MODULES = [
  OutboxModule,
  CatalogModule,
  InventoryModule,
  SalesModule,
  IdentityModule, // el guard global: las rutas exigen sesión
];
const BASE = Date.parse('2026-10-28T10:00:00.000Z');

async function orderAt(customerId: string, minutes: number) {
  const order = await insertOrder(customerId);
  await query('UPDATE sales.orders SET created_at = $2 WHERE id = $1', [
    order.id,
    new Date(BASE + minutes * 60_000).toISOString(),
  ]);
  return order;
}

describe('GET /orders?customerId= (historial, e2e, aplicación y PostgreSQL reales)', () => {
  describe('con ADMIN_API_ENABLED=false', () => {
    let app: INestApplication;
    let admin: { Authorization: string };
    beforeAll(async () => {
      app = await createHttpApp(MODULES, {
        ADMIN_API_ENABLED: 'false',
        PAYMENT_PROVIDER: 'fake',
      });
      admin = await bearer(app, 'ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);

    it('el historial responde 404 como una ruta que no existe, aunque el cliente tenga pedidos', async () => {
      const ana = await insertCustomer();
      await orderAt(ana.id, 1);

      const res = await request(app.getHttpServer())
        .get(`/orders?customerId=${ana.id}`)
        .set(admin)
        .expect(404);

      expect(res.body).toEqual({
        message: `Cannot GET /orders?customerId=${ana.id}`,
        error: 'Not Found',
        statusCode: 404,
      });
    });

    it('y también con parámetros inválidos: 404 y no 400', async () => {
      await request(app.getHttpServer()).get('/orders').set(admin).expect(404);
      await request(app.getHttpServer())
        .get('/orders?customerId=nada&limit=999')
        .set(admin)
        .expect(404);
    });

    // El guard va en el método y no en la clase: el resto de OrderController sigue disponible para quien tenga sesión
    it('POST /orders (comprador) y GET /orders/:id (administrador) siguen disponibles', async () => {
      const post = await request(app.getHttpServer())
        .post('/orders')
        .set(await bearer(app, 'BUYER'))
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(400);
      expect(post.body.statusCode).toBe(400); // la validación responde: la ruta existe
      const ana = await insertCustomer();
      const order = await orderAt(ana.id, 1);
      await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set(admin)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/orders/${randomUUID()}`)
        .set(admin)
        .expect(404);
    });

    it('la documentación no muestra el historial pero sí POST /orders y GET /orders/{id}', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      expect(res.body.paths['/orders'].post).toBeDefined();
      expect(res.body.paths['/orders'].get).toBeUndefined();
      expect(res.body.paths['/orders/{id}'].get).toBeDefined();
    });
  });

  describe('con ADMIN_API_ENABLED=true', () => {
    let app: INestApplication;
    let admin: { Authorization: string };
    beforeAll(async () => {
      app = await createHttpApp(MODULES, {
        ADMIN_API_ENABLED: 'true',
        PAYMENT_PROVIDER: 'fake',
      });
      admin = await bearer(app, 'ADMIN');
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);

    const get = (queryString: string) =>
      request(app.getHttpServer()).get(`/orders${queryString}`).set(admin);

    it('200 con los pedidos del cliente, del más reciente al más antiguo', async () => {
      const ana = await insertCustomer();
      const old = await orderAt(ana.id, 1);
      const recent = await orderAt(ana.id, 9);

      const res = await get(`?customerId=${ana.id}`).expect(200);

      expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([
        recent.id,
        old.id,
      ]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('cada pedido trae su fecha, su monto, sus líneas y la dirección (null en los anteriores a ella)', async () => {
      const ana = await insertCustomer();
      await orderAt(ana.id, 0);

      const [item] = (await get(`?customerId=${ana.id}`).expect(200)).body
        .items;

      expect(item).toMatchObject({
        status: 'PLACED',
        createdAt: '2026-10-28T10:00:00.000Z',
        charged: { amount: '90.00', currency: 'PEN' },
        shippingAddress: null,
      });
      expect(item.lines).toHaveLength(1);
    });

    it('se recorre por páginas con nextCursor, sin repetir ni omitir', async () => {
      const ana = await insertCustomer();
      const created: string[] = [];
      for (let i = 1; i <= 5; i++) created.push((await orderAt(ana.id, i)).id);

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: request.Response = await get(
          `?customerId=${ana.id}&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
        ).expect(200);
        seen.push(...res.body.items.map((o: { id: string }) => o.id));
        cursor = res.body.nextCursor;
        pages++;
      } while (cursor);

      expect(seen).toEqual([...created].reverse());
      expect(pages).toBe(3);
    });

    it('un cliente sin pedidos recibe una lista vacía', async () => {
      const res = await get(`?customerId=${randomUUID()}`).expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('no mezcla los pedidos de otros clientes', async () => {
      const ana = await insertCustomer();
      const luis = await insertCustomer();
      await orderAt(ana.id, 1);
      await orderAt(luis.id, 2);
      await orderAt(luis.id, 3);

      expect(
        (await get(`?customerId=${ana.id}`).expect(200)).body.items,
      ).toHaveLength(1);
    });

    it('acepta el límite máximo, 50, y el mínimo, 1', async () => {
      const ana = await insertCustomer();
      await orderAt(ana.id, 1);
      await get(`?customerId=${ana.id}&limit=50`).expect(200);
      await get(`?customerId=${ana.id}&limit=1`).expect(200);
    });

    it.each([
      ['sin customerId', ''],
      ['customerId vacío', '?customerId='],
      ['customerId que no es UUID', '?customerId=12345'],
      [
        'customerId repetido',
        `?customerId=${randomUUID()}&customerId=${randomUUID()}`,
      ],
      ['limit 0', `?customerId=${randomUUID()}&limit=0`],
      ['limit negativo', `?customerId=${randomUUID()}&limit=-1`],
      ['limit mayor que 50', `?customerId=${randomUUID()}&limit=51`],
      ['limit decimal', `?customerId=${randomUUID()}&limit=2.5`],
      ['limit con letras', `?customerId=${randomUUID()}&limit=muchos`],
      [
        'cursor que no se decodifica',
        `?customerId=${randomUUID()}&cursor=hola`,
      ],
      [
        'cursor con caracteres inválidos',
        `?customerId=${randomUUID()}&cursor=a%20b`,
      ],
      [
        'cursor demasiado largo',
        `?customerId=${randomUUID()}&cursor=${'A'.repeat(300)}`,
      ],
      ['parámetro desconocido', `?customerId=${randomUUID()}&page=2`],
    ])('400 si hay %s', async (_caso, queryString) => {
      await get(queryString).expect(400);
    });

    it('GET /orders/:id no se confunde con el historial', async () => {
      const ana = await insertCustomer();
      const order = await orderAt(ana.id, 1);
      const res = await request(app.getHttpServer())
        .get(`/orders/${order.id}`)
        .set(admin)
        .expect(200);
      expect(res.body.id).toBe(order.id);
      expect(res.body).not.toHaveProperty('shippingAddress'); // decisión D2: solo el historial de administración la lleva
    });

    it('lo documenta con las etiquetas orders y admin, sus parámetros y respuestas', async () => {
      const res = await request(app.getHttpServer())
        .get('/docs-json')
        .expect(200);
      const operation = res.body.paths['/orders'].get;
      expect(operation.tags).toEqual(
        expect.arrayContaining(['orders', 'admin']),
      );
      expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual(
        expect.arrayContaining(['customerId', 'cursor', 'limit']),
      );
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining(['200', '400', '404']),
      );
      expect(res.body.paths['/orders'].post.tags).not.toContain('admin');
    });
  });
});
