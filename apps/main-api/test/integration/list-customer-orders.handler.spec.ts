import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from '../../src/contexts/sales/application/order/list-customer-orders.query.js';
import { ListCustomerOrdersHandler } from '../../src/contexts/sales/infrastructure/persistence/list-customer-orders.handler.js';
import { OrderCursor } from '../../src/contexts/sales/infrastructure/persistence/order-cursor.js';
import { insertCustomer, insertOrder } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

@Module({ providers: [ListCustomerOrdersHandler] })
class OrderQueries {}

describe('ListCustomerOrdersHandler (PostgreSQL real, por el QueryBus)', () => {
  let app: INestApplication;
  let queryBus: QueryBus;

  beforeAll(async () => {
    app = await createTestApp(OrderQueries);
    queryBus = app.get(QueryBus);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const list = (
    customerId: string,
    limit = 20,
    after?: { createdAt: Date; id: string },
  ): Promise<OrderHistoryPage> =>
    queryBus.execute(new ListCustomerOrdersQuery(customerId, limit, after));
  // Un pedido del cliente con una fecha concreta (minutos desde un instante fijo)
  const BASE = Date.parse('2026-10-28T10:00:00.000Z');
  async function orderAt(
    customerId: string,
    minutes: number,
    options: Parameters<typeof insertOrder>[1] = {},
  ) {
    const order = await insertOrder(customerId, options);
    await query('UPDATE sales.orders SET created_at = $2 WHERE id = $1', [
      order.id,
      new Date(BASE + minutes * 60_000).toISOString(),
    ]);
    return order;
  }
  const ids = (page: OrderHistoryPage) => page.items.map((o) => o.id);
  const cursorOf = (page: OrderHistoryPage) => {
    const decoded = page.nextCursor
      ? OrderCursor.decode(page.nextCursor)
      : undefined;
    return decoded ?? undefined;
  };

  describe('qué pedidos devuelve', () => {
    it('solo los del cliente', async () => {
      const ana = await insertCustomer();
      const luis = await insertCustomer();
      const mine = await orderAt(ana.id, 1);
      await orderAt(luis.id, 2);

      expect(ids(await list(ana.id))).toEqual([mine.id]);
    });

    it('un cliente sin pedidos, o que no existe, recibe una lista vacía', async () => {
      const ana = await insertCustomer();
      expect(await list(ana.id)).toEqual({ items: [], nextCursor: null });
      expect(await list(randomUUID())).toEqual({ items: [], nextCursor: null });
    });

    it('del más reciente al más antiguo', async () => {
      const ana = await insertCustomer();
      const old = await orderAt(ana.id, 1);
      const recent = await orderAt(ana.id, 30);
      const middle = await orderAt(ana.id, 15);

      expect(ids(await list(ana.id))).toEqual([recent.id, middle.id, old.id]);
    });
  });

  // El desempate por id tiene que venir de la consulta y no de que el índice lo devuelva ya ordenado: se prueba también
  // sin el índice, donde los empates salen en el orden físico (aquí, el de inserción, que es el contrario)
  describe.each([
    ['con el índice', true],
    ['sin el índice', false],
  ])('pedidos con el mismo instante, %s', (_name, withIndex) => {
    const INDEX = 'orders_customer_id_created_at_id_idx';
    beforeEach(async () => {
      if (!withIndex) await query(`DROP INDEX sales.${INDEX}`);
    });
    afterEach(async () => {
      if (!withIndex) {
        await query(
          `CREATE INDEX "${INDEX}" ON sales.orders (customer_id, created_at DESC, id DESC)`,
        );
      }
    });

    // Ids en orden creciente de inserción: sin ORDER BY id, los empates saldrían de más viejo a más nuevo
    const sameInstant = async (customerId: string, count: number) => {
      const created = [];
      for (let i = 1; i <= count; i++) {
        created.push(
          await orderAt(customerId, 9, {
            id: `0196a000-0000-7000-8000-0000000000${String(i).padStart(2, '0')}`,
          }),
        );
      }
      return created.map((o) => o.id);
    };

    it('desempata por id descendente', async () => {
      const ana = await insertCustomer();
      const created = await sameInstant(ana.id, 4);

      expect(ids(await list(ana.id))).toEqual([...created].reverse());
    });

    it('repartidos entre páginas salen cada uno una vez, de mayor a menor id', async () => {
      const ana = await insertCustomer();
      const created = await sameInstant(ana.id, 5);

      const seen: string[] = [];
      let after: { createdAt: Date; id: string } | undefined;
      do {
        const page = await list(ana.id, 2, after);
        seen.push(...ids(page));
        after = cursorOf(page);
      } while (after);

      expect(seen).toEqual([...created].reverse());
    });
  });

  describe('la forma de cada pedido', () => {
    it('id, estado, fecha en ISO, monto cobrado, líneas por ISBN y la dirección', async () => {
      const ana = await insertCustomer();
      const order = await orderAt(ana.id, 0, {
        charged: '110.00',
        lines: [
          {
            isbn: '9780306406157',
            title: 'Segundo',
            unit_price: '60.500000',
            quantity: 1,
          },
          {
            isbn: '9780132350884',
            title: 'Primero',
            unit_price: '45.000000',
            quantity: 2,
          },
        ],
      });
      await query(
        `UPDATE sales.orders SET ship_recipient = 'Ana Pérez', ship_phone = '999888777', ship_line1 = 'Av. Larco 123',
           ship_district = 'Miraflores', ship_province = 'Lima', ship_department = 'Lima' WHERE id = $1`,
        [order.id],
      );

      const [item] = (await list(ana.id)).items;

      expect(item).toEqual({
        id: order.id,
        status: 'PLACED',
        createdAt: '2026-10-28T10:00:00.000Z',
        charged: { amount: '110.00', currency: 'PEN' },
        lines: [
          {
            isbn: '9780132350884',
            title: 'Primero',
            unitPrice: { amount: '45.00', currency: 'PEN' },
            quantity: 2,
          },
          {
            isbn: '9780306406157',
            title: 'Segundo',
            unitPrice: { amount: '60.50', currency: 'PEN' },
            quantity: 1,
          },
        ],
        shippingAddress: {
          recipient: 'Ana Pérez',
          phone: '999888777',
          line1: 'Av. Larco 123',
          district: 'Miraflores',
          province: 'Lima',
          department: 'Lima',
          reference: null,
        },
      });
    });

    it('la referencia de la dirección sale con su valor cuando existe', async () => {
      const ana = await insertCustomer();
      const order = await orderAt(ana.id, 0);
      await query(
        `UPDATE sales.orders SET ship_recipient = 'Ana', ship_phone = '999888777', ship_line1 = 'Av. Larco 123',
           ship_district = 'Miraflores', ship_province = 'Lima', ship_department = 'Lima',
           ship_reference = 'Frente al parque' WHERE id = $1`,
        [order.id],
      );

      expect((await list(ana.id)).items[0].shippingAddress).toMatchObject({
        reference: 'Frente al parque',
      });
    });

    it('un pedido anterior a la dirección sale con shippingAddress null', async () => {
      const ana = await insertCustomer();
      await orderAt(ana.id, 0);
      expect((await list(ana.id)).items[0].shippingAddress).toBeNull();
    });

    it('un pedido en dólares se muestra en dólares', async () => {
      const ana = await insertCustomer();
      await orderAt(ana.id, 0, {
        charged: '23.00',
        currency: 'USD',
        lines: [{ unit_price: '20.000000' }],
      });

      const [item] = (await list(ana.id)).items;

      expect(item.charged).toEqual({ amount: '23.00', currency: 'USD' });
      expect(item.lines[0].unitPrice).toEqual({
        amount: '20.00',
        currency: 'USD',
      });
    });

    it('las líneas de un pedido no se mezclan con las de otro', async () => {
      const ana = await insertCustomer();
      await orderAt(ana.id, 1, { lines: [{ quantity: 1 }] });
      await orderAt(ana.id, 2, { lines: [{ quantity: 5 }, { quantity: 6 }] });

      expect((await list(ana.id)).items.map((o) => o.lines.length)).toEqual([
        2, 1,
      ]);
    });
  });

  describe('páginas con cursor', () => {
    async function seven() {
      const ana = await insertCustomer();
      const orders = [];
      for (let i = 1; i <= 7; i++) orders.push(await orderAt(ana.id, i));
      return { ana, newestFirst: orders.map((o) => o.id).reverse() };
    }

    it('recorrer todas las páginas da todos los pedidos, sin repetir ni omitir ninguno', async () => {
      const { ana, newestFirst } = await seven();

      const seen: string[] = [];
      let after: { createdAt: Date; id: string } | undefined;
      let pages = 0;
      do {
        const page = await list(ana.id, 3, after);
        seen.push(...ids(page));
        after = cursorOf(page);
        pages++;
      } while (after);

      expect(seen).toEqual(newestFirst);
      expect(pages).toBe(3); // 3 + 3 + 1
    });

    it('la última página trae nextCursor null', async () => {
      const { ana } = await seven();
      const first = await list(ana.id, 3);
      const second = await list(ana.id, 3, cursorOf(first));
      const third = await list(ana.id, 3, cursorOf(second));
      expect(first.nextCursor).not.toBeNull();
      expect(second.nextCursor).not.toBeNull();
      expect(third.items).toHaveLength(1);
      expect(third.nextCursor).toBeNull();
    });

    it('si el total es múltiplo del límite no hay una página final vacía', async () => {
      const ana = await insertCustomer();
      for (let i = 1; i <= 6; i++) await orderAt(ana.id, i);

      const first = await list(ana.id, 3);
      const second = await list(ana.id, 3, cursorOf(first));

      expect(second.items).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
    });

    it('un límite mayor que el total devuelve todo y nextCursor null', async () => {
      const { ana, newestFirst } = await seven();
      const page = await list(ana.id, 50);
      expect(ids(page)).toEqual(newestFirst);
      expect(page.nextCursor).toBeNull();
    });

    it('con límite 1 recorre uno a uno', async () => {
      const { ana, newestFirst } = await seven();
      const seen: string[] = [];
      let after: { createdAt: Date; id: string } | undefined;
      do {
        const page = await list(ana.id, 1, after);
        seen.push(...ids(page));
        after = cursorOf(page);
      } while (after);
      expect(seen).toEqual(newestFirst);
    });

    // Con páginas numeradas, un pedido nuevo desplazaría a los demás y se repetiría uno de la página anterior
    it('un pedido nuevo entre dos páginas no repite ni omite ninguno', async () => {
      const { ana, newestFirst } = await seven();
      const first = await list(ana.id, 3);

      await orderAt(ana.id, 100); // llega un pedido más reciente que todos
      const second = await list(ana.id, 3, cursorOf(first));

      expect(ids(first)).toEqual(newestFirst.slice(0, 3));
      expect(ids(second)).toEqual(newestFirst.slice(3, 6));
    });

    it('el cursor sigue valiendo aunque el pedido al que apunta ya no exista', async () => {
      const { ana, newestFirst } = await seven();
      const first = await list(ana.id, 3);
      const cursor = cursorOf(first)!;
      await query('DELETE FROM sales.order_lines WHERE order_id = $1', [
        cursor.id,
      ]);
      await query('DELETE FROM sales.orders WHERE id = $1', [cursor.id]);

      const second = await list(ana.id, 3, cursor);

      expect(ids(second)).toEqual(newestFirst.slice(3, 6));
    });

    it('pedidos con el mismo instante repartidos entre páginas salen cada uno una vez', async () => {
      const ana = await insertCustomer();
      const same = await Promise.all(
        [1, 2, 3, 4, 5].map(() => orderAt(ana.id, 9)),
      );

      const seen: string[] = [];
      let after: { createdAt: Date; id: string } | undefined;
      do {
        const page = await list(ana.id, 2, after);
        seen.push(...ids(page));
        after = cursorOf(page);
      } while (after);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort((a, b) => a.localeCompare(b))).toEqual(
        same.map((o) => o.id).sort((a, b) => a.localeCompare(b)),
      );
    });

    it('un cursor de un pedido de otro cliente no filtra datos: solo posiciona dentro de los del cliente pedido', async () => {
      const ana = await insertCustomer();
      const luis = await insertCustomer();
      const a1 = await orderAt(ana.id, 1);
      const a2 = await orderAt(ana.id, 5);
      const foreign = await orderAt(luis.id, 3);

      const page = await list(ana.id, 10, {
        createdAt: new Date(BASE + 3 * 60_000),
        id: foreign.id,
      });

      expect(ids(page)).toEqual([a1.id]); // lo anterior a las 10:03; nunca el pedido de Luis ni uno posterior
      expect(ids(page)).not.toContain(a2.id);
    });
  });

  it('el índice (customer_id, created_at DESC, id DESC) existe y el planificador puede usarlo', async () => {
    const [index] = await query<{ indexdef: string }>(
      "SELECT indexdef FROM pg_indexes WHERE schemaname = 'sales' AND tablename = 'orders' AND indexdef ILIKE '%customer_id%created_at%'",
    );
    expect(index.indexdef).toMatch(/customer_id, created_at DESC, id DESC/);
  });
});
