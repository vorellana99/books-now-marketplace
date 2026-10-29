import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { bearer } from '../support/auth.js';
import { insertCustomer, insertOrder } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const BASE = Date.parse('2026-10-28T10:00:00.000Z');
async function orderAt(customerId: string, minutes: number) {
  const order = await insertOrder(customerId);
  await query('UPDATE sales.orders SET created_at = $2 WHERE id = $1', [
    order.id,
    new Date(BASE + minutes * 60_000).toISOString(),
  ]);
  return order;
}

describe('GET /me/orders (mis pedidos, e2e, aplicación y PostgreSQL reales)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createHttpApp([
      OutboxModule,
      CatalogModule,
      InventoryModule,
      SalesModule,
      IdentityModule,
      AUTH_MODULE,
    ]);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const asBuyer = async (customerId: string) =>
    bearer(app, 'BUYER', customerId);
  // `await mine(id).expect(200)` — el token se firma al lanzar la petición
  const mine = (customerId: string, queryString = '') => ({
    expect: async (status: number) =>
      request(app.getHttpServer())
        .get(`/me/orders${queryString}`)
        .set(await asBuyer(customerId))
        .expect(status),
  });

  it('200 con los pedidos de quien tiene la sesión, del más reciente al más antiguo', async () => {
    const ana = await insertCustomer();
    const old = await orderAt(ana.id, 1);
    const recent = await orderAt(ana.id, 9);

    const res = await mine(ana.id).expect(200);

    expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([
      recent.id,
      old.id,
    ]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('no mezcla los pedidos de otros clientes', async () => {
    const [ana, luis] = [await insertCustomer(), await insertCustomer()];
    const anas = await orderAt(ana.id, 1);
    await orderAt(luis.id, 2);
    await orderAt(luis.id, 3);

    const res = await mine(ana.id).expect(200);

    expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([anas.id]);
  });

  it('cada pedido trae su fecha, su monto, sus líneas y la dirección', async () => {
    const ana = await insertCustomer();
    await orderAt(ana.id, 0);

    const [item] = (await mine(ana.id).expect(200)).body.items;

    expect(item).toMatchObject({
      status: 'PLACED',
      createdAt: '2026-10-28T10:00:00.000Z',
      charged: { amount: '90.00', currency: 'PEN' },
    });
    expect(item.lines).toHaveLength(1);
    expect(item).toHaveProperty('shippingAddress');
  });

  it('un comprador sin pedidos recibe una lista vacía', async () => {
    const res = await mine(randomUUID()).expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('se recorre por páginas con nextCursor, sin repetir ni omitir', async () => {
    const ana = await insertCustomer();
    const created: string[] = [];
    for (let i = 1; i <= 5; i++) created.push((await orderAt(ana.id, i)).id);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await mine(
        ana.id,
        `?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      ).expect(200);
      seen.push(...res.body.items.map((o: { id: string }) => o.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);

    expect(seen).toEqual([...created].reverse());
    expect(pages).toBe(3);
  });

  it('el cursor de otro comprador no lleva a sus pedidos: el filtro es siempre el del token', async () => {
    const [ana, luis] = [await insertCustomer(), await insertCustomer()];
    for (let i = 1; i <= 4; i++) await orderAt(ana.id, i);
    const luisOrder = await orderAt(luis.id, 0);
    const anaPage = await mine(ana.id, '?limit=2').expect(200);

    const res = await mine(
      luis.id,
      `?cursor=${anaPage.body.nextCursor}`,
    ).expect(200);

    expect(res.body.items.map((o: { id: string }) => o.id)).toEqual([
      luisOrder.id,
    ]);
  });

  it.each([
    ['limit 0', '?limit=0'],
    ['limit mayor que 50', '?limit=51'],
    ['limit decimal', '?limit=2.5'],
    ['cursor que no se decodifica', '?cursor=hola'],
    ['cursor demasiado largo', `?cursor=${'A'.repeat(300)}`],
  ])('400 con %s', async (_why, queryString) => {
    await mine(randomUUID(), queryString).expect(400);
  });

  it('un customerId en la URL es 400: el cliente es el de la sesión, no se elige', async () => {
    const [ana, luis] = [await insertCustomer(), await insertCustomer()];
    await orderAt(luis.id, 1);

    await mine(ana.id, `?customerId=${luis.id}`).expect(400);
  });

  it('sin token 401; un administrador 403 (no es comprador)', async () => {
    await request(app.getHttpServer()).get('/me/orders').expect(401);
    await request(app.getHttpServer())
      .get('/me/orders')
      .set(await bearer(app, 'ADMIN'))
      .expect(403);
  });

  it('lo documenta con la etiqueta orders, sus parámetros y respuestas', async () => {
    const res = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const operation = res.body.paths['/me/orders'].get;
    expect(operation.tags).toEqual(expect.arrayContaining(['orders']));
    expect(operation.tags).not.toContain('admin');
    expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual(
      expect.arrayContaining(['cursor', 'limit']),
    );
    expect(
      operation.parameters.map((p: { name: string }) => p.name),
    ).not.toContain('customerId');
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403']),
    );
  });
});
