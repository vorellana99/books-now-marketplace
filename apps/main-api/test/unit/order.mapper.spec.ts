import { OrderMapper } from '../../src/contexts/sales/infrastructure/order/order.mapper.js';
import { OrderFactory } from '../../src/contexts/sales/domain/order/order.factory.js';
import { Prisma } from '../../src/platform/prisma/generated/client.js';

const item = (overrides: Record<string, unknown> = {}) => ({
  isbn: '9780306406157',
  quantity: 2,
  title: 'Clean Code',
  price: '33.335',
  currency: 'PEN' as const,
  ...overrides,
});

describe('OrderMapper', () => {
  describe('toCreate: del pedido a las filas de la base', () => {
    it('arma el pedido con el monto cobrado en texto y las líneas anidadas', () => {
      const order = OrderFactory.fromCart('o-1', 'c-1', [
        item(),
        item({
          isbn: '9780306406140',
          title: 'Otro',
          price: '10.00',
          quantity: 1,
        }),
      ]);
      order.place();

      const data = OrderMapper.toCreate(order, '90.00', 'PEN');

      expect(data).toMatchObject({
        id: 'o-1',
        customerId: 'c-1',
        status: 'PLACED',
        chargedAmount: '90.00',
        currency: 'PEN',
      });
      expect(data.lines.create).toEqual([
        {
          isbn: '9780306406157',
          title: 'Clean Code',
          unitPrice: '33.335',
          currency: 'PEN',
          quantity: 2,
        },
        {
          isbn: '9780306406140',
          title: 'Otro',
          unitPrice: '10',
          currency: 'PEN',
          quantity: 1,
        },
      ]);
    });

    it('el precio unitario va como texto, sin pasar por number', () => {
      const order = OrderFactory.fromCart('o-1', 'c-1', [
        item({ price: '0.1', quantity: 3 }),
      ]);
      order.place();

      const [line] = OrderMapper.toCreate(order, '1.00', 'PEN').lines
        .create as { unitPrice: unknown }[];

      expect(typeof line.unitPrice).toBe('string');
      expect(line.unitPrice).toBe('0.1');
    });
  });

  describe('toDomain: de las filas de la base al pedido', () => {
    const row = {
      id: 'o-1',
      customerId: 'c-1',
      status: 'PLACED' as const,
      chargedAmount: new Prisma.Decimal('90.00'),
      currency: 'PEN' as const,
      createdAt: new Date(),
      lines: [
        {
          orderId: 'o-1',
          isbn: '9780306406157',
          title: 'Clean Code',
          unitPrice: new Prisma.Decimal('33.335000'),
          currency: 'PEN' as const,
          quantity: 2,
        },
      ],
    };

    it('reconstruye un pedido confirmado con los precios exactos de la base', () => {
      const order = OrderMapper.toDomain(row);

      expect(order.status).toBe('PLACED');
      expect(order.customerId).toBe('c-1');
      expect(order.getLines()[0].unitPrice.amount.toString()).toBe('33.335');
      expect(order.getLines()[0].isbn.value).toBe('9780306406157');
      expect(order.pullEvents()).toEqual([]);
    });

    it('usa la moneda de cada línea', () => {
      const usd = {
        ...row,
        currency: 'USD' as const,
        lines: [{ ...row.lines[0], currency: 'USD' as const }],
      };
      expect(OrderMapper.toDomain(usd).currency).toBe('USD');
    });
  });
});
