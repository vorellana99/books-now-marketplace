import { Query } from '@nestjs/cqrs';
import type { OrderView } from './get-order.query.js';

export interface ShippingAddressView {
  recipient: string;
  phone: string;
  line1: string;
  district: string;
  province: string;
  department: string;
  reference: string | null;
}

// Un pedido en el historial de administración: la vista del pedido más su fecha y la dirección de envío (que
// GET /orders/:id no devuelve, porque no tiene autenticación). null en un pedido anterior a que existiera la dirección
export interface OrderHistoryItem extends OrderView {
  createdAt: string; // ISO 8601, en UTC
  shippingAddress: ShippingAddressView | null;
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
