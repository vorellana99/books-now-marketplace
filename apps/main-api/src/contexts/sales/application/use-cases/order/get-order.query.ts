import { Query } from '@nestjs/cqrs';
import type {
  MoneyView,
  OrderDetail,
  OrderRequester,
  OrderView,
  ShippingAddressView,
} from '../../../domain/model/order/order-view.js';

export type {
  MoneyView,
  OrderDetail,
  OrderRequester,
  OrderView,
  ShippingAddressView,
};

// Lectura directa de la base, sin pasar por el agregado. Falla con NotFoundError si el pedido no existe o, para un
// comprador, si es de otro cliente (el mismo error, para no revelar que existe)
export class GetOrderQuery extends Query<OrderDetail> {
  constructor(
    readonly id: string,
    readonly requester: OrderRequester,
  ) {
    super();
  }
}
