import { Query } from '@nestjs/cqrs';
import type { OrderDetail, ShippingAddressView } from './get-order.query.js';

export type { ShippingAddressView };

// Un pedido en un historial (el del comprador o el de administración): el detalle del pedido, con su dirección de envío,
// más su fecha
export interface OrderHistoryItem extends OrderDetail {
  createdAt: string; // ISO 8601, en UTC
}

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
    readonly after?: { createdAt: Date; id: string },
  ) {
    super();
  }
}
