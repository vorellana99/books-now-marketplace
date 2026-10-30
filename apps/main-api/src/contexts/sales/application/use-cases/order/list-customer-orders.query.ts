import { Query } from '@nestjs/cqrs';
import type {
  OrderHistoryItem,
  OrderPosition,
  ShippingAddressView,
} from '../../../domain/model/order/order-view.js';

export type { OrderHistoryItem, ShippingAddressView };

export interface OrderHistoryPage {
  items: OrderHistoryItem[];
  nextCursor: string | null; // null en la última página
}

// Los pedidos de un cliente, del más reciente al más antiguo. `after` es la posición del último pedido de la página
// anterior (decodificada del cursor). Lectura directa de la base, sin pasar por el agregado
export class ListCustomerOrdersQuery extends Query<OrderHistoryPage> {
  constructor(
    readonly customerId: string,
    readonly limit: number,
    readonly after?: OrderPosition,
  ) {
    super();
  }
}
