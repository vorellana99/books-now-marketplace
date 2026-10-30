import { randomUUID } from 'node:crypto';
import { GetOrderHandler } from '../../../src/contexts/sales/application/use-cases/order/get-order.handler.js';
import { GetOrderQuery } from '../../../src/contexts/sales/application/use-cases/order/get-order.query.js';
import { ListCustomerOrdersHandler } from '../../../src/contexts/sales/application/use-cases/order/list-customer-orders.handler.js';
import { ListCustomerOrdersQuery } from '../../../src/contexts/sales/application/use-cases/order/list-customer-orders.query.js';
import { OrderCursor } from '../../../src/contexts/sales/application/support/order-cursor.js';
import { NotFoundError } from '../../../src/shared-kernel/domain.errors.js';
import { InMemoryOrderHistory } from '../../fakes/in-memory-order-history.js';

const ANA = randomUUID();
const LUIS = randomUUID();

describe('GetOrderHandler', () => {
  it('devuelve el pedido a su dueño', async () => {
    const history = new InMemoryOrderHistory();
    const order = history.seed({ customerId: ANA });

    const view = await new GetOrderHandler(history).execute(
      new GetOrderQuery(order.id, { userId: ANA, role: 'BUYER' }),
    );

    expect(view.id).toBe(order.id);
    expect(view.charged).toEqual({ amount: '90.00', currency: 'PEN' });
  });

  it('un administrador ve el de cualquiera', async () => {
    const history = new InMemoryOrderHistory();
    const order = history.seed({ customerId: ANA });

    const view = await new GetOrderHandler(history).execute(
      new GetOrderQuery(order.id, { userId: randomUUID(), role: 'ADMIN' }),
    );

    expect(view.id).toBe(order.id);
  });

  it('el pedido de otro cliente y uno que no existe dan el mismo NotFoundError', async () => {
    const history = new InMemoryOrderHistory();
    const order = history.seed({ customerId: ANA });
    const handler = new GetOrderHandler(history);
    const failure = (id: string) =>
      handler
        .execute(new GetOrderQuery(id, { userId: LUIS, role: 'BUYER' }))
        .then(
          () => undefined,
          (e: unknown) => e as NotFoundError,
        );

    const missingId = randomUUID();
    const foreign = await failure(order.id);
    const missing = await failure(missingId);

    expect(foreign).toBeInstanceOf(NotFoundError);
    expect(missing).toBeInstanceOf(NotFoundError);
    // Solo cambia el id que se pidió: nada delata cuál de los dos casos es
    expect(foreign?.message.replace(order.id, '#')).toBe(
      missing?.message.replace(missingId, '#'),
    );
  });
});

describe('ListCustomerOrdersHandler', () => {
  const seedThree = (history: InMemoryOrderHistory) =>
    ['01', '02', '03'].map((day) =>
      history.seed({
        customerId: ANA,
        createdAt: new Date(`2026-04-${day}T10:00:00.000Z`),
      }),
    );

  it('devuelve los pedidos del cliente, el más reciente primero', async () => {
    const history = new InMemoryOrderHistory();
    const [oldest, , newest] = seedThree(history);
    history.seed({ customerId: LUIS });

    const page = await new ListCustomerOrdersHandler(history).execute(
      new ListCustomerOrdersQuery(ANA, 10),
    );

    expect(page.items.map((i) => i.id)).toEqual([
      newest.id,
      expect.any(String),
      oldest.id,
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('con más pedidos que el límite, el cursor es la posición del último de la página, codificada', async () => {
    const history = new InMemoryOrderHistory();
    seedThree(history);

    const page = await new ListCustomerOrdersHandler(history).execute(
      new ListCustomerOrdersQuery(ANA, 2),
    );

    expect(page.items).toHaveLength(2);
    expect(OrderCursor.decode(page.nextCursor ?? '')).toEqual({
      createdAt: new Date('2026-04-02T10:00:00.000Z'),
      id: page.items[1].id,
    });
  });

  it('`after` se pasa tal cual: la página siguiente empieza donde terminó la anterior', async () => {
    const history = new InMemoryOrderHistory();
    const [oldest] = seedThree(history);
    const handler = new ListCustomerOrdersHandler(history);
    const first = await handler.execute(new ListCustomerOrdersQuery(ANA, 2));

    const second = await handler.execute(
      new ListCustomerOrdersQuery(
        ANA,
        2,
        OrderCursor.decode(first.nextCursor ?? '') ?? undefined,
      ),
    );

    expect(second.items.map((i) => i.id)).toEqual([oldest.id]);
    expect(second.nextCursor).toBeNull();
  });
});
