import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetOrderQuery } from '../../src/contexts/sales/application/order/get-order.query.js';
import { GetOrderHandler } from '../../src/contexts/sales/infrastructure/order/get-order.handler.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';
import { insertCustomer, insertOrder } from '../support/builders.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

@Module({ providers: [GetOrderHandler] })
class OrderQueries {}

describe('GetOrderHandler (PostgreSQL real, por el QueryBus)', () => {
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

  const get = (id: string) => queryBus.execute(new GetOrderQuery(id));

  it('devuelve el pedido con el monto cobrado y las líneas como { amount, currency }', async () => {
    const customer = await insertCustomer();
    const order = await insertOrder(customer.id, {
      charged: '90.00',
      lines: [
        {
          isbn: '9780132350884',
          title: 'Clean Code',
          unit_price: '45.000000',
          quantity: 2,
        },
      ],
    });

    expect(await get(order.id)).toEqual({
      id: order.id,
      status: 'PLACED',
      charged: { amount: '90.00', currency: 'PEN' },
      lines: [
        {
          isbn: '9780132350884',
          title: 'Clean Code',
          unitPrice: { amount: '45.00', currency: 'PEN' },
          quantity: 2,
        },
      ],
    });
  });

  it('un pedido en dólares se muestra en dólares, el cobro y cada línea', async () => {
    const customer = await insertCustomer();
    const order = await insertOrder(customer.id, {
      charged: '23.00',
      currency: 'USD',
      lines: [{ unit_price: '20.000000', quantity: 1 }],
    });

    const view = await get(order.id);

    expect(view.charged).toEqual({ amount: '23.00', currency: 'USD' });
    expect(view.lines[0].unitPrice).toEqual({
      amount: '20.00',
      currency: 'USD',
    });
  });

  it('el precio unitario (escala 6 en la BD) se muestra con 2 decimales', async () => {
    const customer = await insertCustomer();
    const order = await insertOrder(customer.id, {
      lines: [{ unit_price: '33.335000' }, { unit_price: '10.004000' }],
    });

    const view = await get(order.id);

    expect(
      view.lines
        .map((l) => l.unitPrice.amount)
        .sort((a, b) => a.localeCompare(b)),
    ).toEqual(['10.00', '33.34']);
  });

  it('las líneas salen ordenadas por ISBN, sin importar cómo se insertaron', async () => {
    const customer = await insertCustomer();
    const order = await insertOrder(customer.id, {
      lines: [
        { isbn: '9780306406157' },
        { isbn: '9780132350884' },
        { isbn: '9780306406140' },
      ],
    });

    const view = await get(order.id);

    expect(view.lines.map((l) => l.isbn)).toEqual([
      '9780132350884',
      '9780306406140',
      '9780306406157',
    ]);
  });

  it('no mezcla las líneas de otro pedido', async () => {
    const customer = await insertCustomer();
    const mine = await insertOrder(customer.id, { lines: [{ quantity: 1 }] });
    await insertOrder(customer.id, {
      lines: [{ quantity: 5 }, { quantity: 6 }],
    });

    expect((await get(mine.id)).lines).toHaveLength(1);
  });

  it('un pedido que no existe lanza NotFoundError', async () => {
    const error = await get(randomUUID()).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
  });

  it('no expone al cliente ni su correo', async () => {
    const customer = await insertCustomer({ email: 'secreto@example.com' });
    const order = await insertOrder(customer.id);
    expect(JSON.stringify(await get(order.id))).not.toContain(
      'secreto@example.com',
    );
  });
});
