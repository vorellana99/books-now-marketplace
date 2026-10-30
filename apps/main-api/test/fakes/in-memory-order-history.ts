import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type { OrderHistorySlice } from '../../src/contexts/sales/domain/ports/order-history.js';
import { OrderHistory } from '../../src/contexts/sales/domain/ports/order-history.js';
import type {
  OrderDetail,
  OrderHistoryItem,
  OrderPosition,
  OrderRequester,
  ShippingAddressView,
} from '../../src/contexts/sales/domain/order/order-view.js';

export interface SeedOrderLine {
  isbn: string;
  title: string;
  unitPrice: string; // "45.000000": la base guarda 6 decimales
  quantity: number;
}

export interface SeedOrder {
  id: string;
  customerId: string;
  createdAt: Date;
  currency: 'PEN' | 'USD';
  charged: string;
  lines: SeedOrderLine[];
  shipping: ShippingAddressView | null;
}

const by = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const money = (amount: string, currency: 'PEN' | 'USD') => ({
  amount: new Decimal(amount).toFixed(2),
  currency,
});

// El lado de lectura en memoria: se le dan los pedidos ya hechos (`seed`) y los devuelve como vistas
export class InMemoryOrderHistory extends OrderHistory {
  private readonly orders: SeedOrder[] = [];

  seed(order: Partial<SeedOrder> & { customerId: string }): SeedOrder {
    const seeded: SeedOrder = {
      id: randomUUID(),
      createdAt: new Date(),
      currency: 'PEN',
      charged: '90.00',
      lines: [
        {
          isbn: '9780132350884',
          title: 'Clean Code',
          unitPrice: '45.000000',
          quantity: 2,
        },
      ],
      shipping: null,
      ...order,
    };
    this.orders.push(seeded);
    return seeded;
  }

  findVisible(
    id: string,
    requester: OrderRequester,
  ): Promise<OrderDetail | null> {
    const order = this.orders.find(
      (o) =>
        o.id === id &&
        (requester.role === 'ADMIN' || o.customerId === requester.userId),
    );
    return Promise.resolve(order ? this.detail(order) : null);
  }

  listByCustomer(
    customerId: string,
    limit: number,
    after?: OrderPosition,
  ): Promise<OrderHistorySlice> {
    const sorted = this.orders
      .filter((o) => o.customerId === customerId)
      .sort(
        (a, b) =>
          b.createdAt.getTime() - a.createdAt.getTime() || by(b.id, a.id),
      )
      .filter(
        (o) =>
          !after ||
          o.createdAt.getTime() < after.createdAt.getTime() ||
          (o.createdAt.getTime() === after.createdAt.getTime() &&
            o.id < after.id),
      );
    const page = sorted.slice(0, limit);
    const last = page.at(-1);
    return Promise.resolve({
      items: page.map((o) => this.item(o)),
      next:
        sorted.length > limit && last
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    });
  }

  private item(order: SeedOrder): OrderHistoryItem {
    return { ...this.detail(order), createdAt: order.createdAt.toISOString() };
  }

  private detail(order: SeedOrder): OrderDetail {
    return {
      id: order.id,
      status: 'PLACED',
      charged: money(order.charged, order.currency),
      lines: [...order.lines]
        .sort((a, b) => by(a.isbn, b.isbn))
        .map((l) => ({
          isbn: l.isbn,
          title: l.title,
          unitPrice: money(l.unitPrice, order.currency),
          quantity: l.quantity,
        })),
      shippingAddress: order.shipping,
    };
  }
}
