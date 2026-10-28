import { DomainError } from '../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { Money, type Currency } from '../shared/money.vo.js';
import { Order } from './order.aggregate.js';
import type { ShippingAddress } from './shipping-address.vo.js';

// Línea del carrito ya valorizada por Catálogo: el precio viaja como texto, nunca como number
export interface PricedCartItem {
  isbn: string;
  quantity: number;
  title: string;
  price: string; // "45.00"
  currency: Currency;
}

export class OrderFactory {
  static fromCart(
    id: string,
    customerId: string,
    items: PricedCartItem[],
    shippingAddress: ShippingAddress | null = null,
  ): Order {
    if (items.length === 0) {
      throw new DomainError('EMPTY_ORDER', 'El carrito no tiene libros');
    }
    const order = new Order(id, customerId, shippingAddress);
    for (const item of items) {
      order.addBook(
        Isbn.create(item.isbn),
        item.title,
        Money.of(item.price, item.currency),
        item.quantity,
      );
    }
    return order;
  }
}
