import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  GetOrderQuery,
  type OrderRequester,
} from '../../src/contexts/sales/application/order/get-order.query.js';
import { ListCustomerOrdersQuery } from '../../src/contexts/sales/application/order/list-customer-orders.query.js';
import { ListCustomerOrdersHandler } from '../../src/contexts/sales/infrastructure/persistence/list-customer-orders.handler.js';
import { GetOrderHandler } from '../../src/contexts/sales/infrastructure/persistence/get-order.handler.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';
import { insertCustomer, insertOrder } from '../support/builders.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

@Module({ providers: [GetOrderHandler, ListCustomerOrdersHandler] })
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

  // Por defecto pregunta un administrador: estos tests miran la vista, no quién la ve
  const get = (
    id: string,
    requester: OrderRequester = { userId: randomUUID(), role: 'ADMIN' },
  ) => queryBus.execute(new GetOrderQuery(id, requester));

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
      shippingAddress: null, // un pedido sin dirección (anterior a que existiera)
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

  describe('quién puede verlo', () => {
    it('su dueño lo ve', async () => {
      const ana = await insertCustomer();
      const order = await insertOrder(ana.id);

      const view = await get(order.id, { userId: ana.id, role: 'BUYER' });

      expect(view.id).toBe(order.id);
    });

    it('otro comprador recibe el mismo NotFoundError que si no existiera', async () => {
      const [ana, luis] = [
        await insertCustomer({ email: 'ana@example.com' }),
        await insertCustomer({ email: 'luis@example.com' }),
      ];
      const order = await insertOrder(ana.id);

      const foreign = (await get(order.id, {
        userId: luis.id,
        role: 'BUYER',
      }).catch((e: unknown) => e)) as NotFoundError;
      const missing = (await get(randomUUID(), {
        userId: luis.id,
        role: 'BUYER',
      }).catch((e: unknown) => e)) as NotFoundError;

      expect(foreign).toBeInstanceOf(NotFoundError);
      expect(foreign.code).toBe('NOT_FOUND');
      expect(foreign.message).toBe(
        missing.message.replace(/\b[0-9a-f-]{36}\b/, order.id),
      );
    });

    it('un administrador ve el de cualquier cliente', async () => {
      const ana = await insertCustomer();
      const order = await insertOrder(ana.id);

      const view = await get(order.id, { userId: randomUUID(), role: 'ADMIN' });

      expect(view.id).toBe(order.id);
    });

    it('el pedido de otro no se lee: la consulta ya lo filtra', async () => {
      const [ana, luis] = [
        await insertCustomer({ email: 'ana@example.com' }),
        await insertCustomer({ email: 'luis@example.com' }),
      ];
      const order = await insertOrder(ana.id);
      const prisma = app.get(PrismaService);
      const find = vi.spyOn(prisma.order, 'findFirst');
      try {
        await get(order.id, { userId: luis.id, role: 'BUYER' }).catch(
          () => undefined,
        );
        expect(find.mock.calls[0][0]?.where).toEqual({
          id: order.id,
          customerId: luis.id,
        });
      } finally {
        find.mockRestore();
      }
    });
  });

  describe('la dirección de envío (DP-15)', () => {
    const ADDRESS = {
      recipient: 'María Quispe',
      phone: '+51 987 654 321',
      line1: 'Jr. Ucayali 150, Dpto 2',
      district: 'Barranco',
      province: 'Lima',
      department: 'Lima',
      reference: 'Casa de rejas verdes',
    };

    it('su dueño la ve completa: las siete partes', async () => {
      const ana = await insertCustomer();
      const order = await insertOrder(ana.id, { shipping: ADDRESS });

      const view = await get(order.id, { userId: ana.id, role: 'BUYER' });

      expect(view.shippingAddress).toEqual(ADDRESS);
    });

    it('un administrador la ve', async () => {
      const ana = await insertCustomer();
      const order = await insertOrder(ana.id, { shipping: ADDRESS });

      const view = await get(order.id, { userId: randomUUID(), role: 'ADMIN' });

      expect(view.shippingAddress).toEqual(ADDRESS);
    });

    it('una referencia ausente sale como null, no como texto vacío', async () => {
      const ana = await insertCustomer();
      const order = await insertOrder(ana.id, {
        shipping: { ...ADDRESS, reference: null },
      });

      const view = await get(order.id, { userId: ana.id, role: 'BUYER' });

      expect(view.shippingAddress?.reference).toBeNull();
      expect(view.shippingAddress?.recipient).toBe('María Quispe');
    });

    it('otro comprador recibe el 404 de siempre, sin nada de la dirección', async () => {
      const [ana, luis] = [
        await insertCustomer({ email: 'ana@example.com' }),
        await insertCustomer({ email: 'luis@example.com' }),
      ];
      const order = await insertOrder(ana.id, { shipping: ADDRESS });

      const error = (await get(order.id, {
        userId: luis.id,
        role: 'BUYER',
      }).catch((e: unknown) => e)) as NotFoundError;

      expect(error).toBeInstanceOf(NotFoundError);
      for (const part of ['Quispe', '987', 'Ucayali', 'rejas']) {
        expect(error.message).not.toContain(part);
      }
    });

    it('el detalle y la lista del mismo pedido traen la misma dirección', async () => {
      const ana = await insertCustomer();
      const order = await insertOrder(ana.id, { shipping: ADDRESS });

      const detail = await get(order.id, { userId: ana.id, role: 'BUYER' });
      const list = await queryBus.execute(
        new ListCustomerOrdersQuery(ana.id, 10),
      );

      expect(list.items[0].shippingAddress).toEqual(detail.shippingAddress);
    });
  });
});
