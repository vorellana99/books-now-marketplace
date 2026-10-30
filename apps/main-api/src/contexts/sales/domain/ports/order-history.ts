import type {
  OrderDetail,
  OrderHistoryItem,
  OrderPosition,
  OrderRequester,
} from '../order/order-view.js';

// Una página del historial: los pedidos y la posición de la que seguiría la página siguiente (null en la última)
export interface OrderHistorySlice {
  items: OrderHistoryItem[];
  next: OrderPosition | null;
}

// El lado de lectura de los pedidos, con vistas y sin reconstruir el agregado
export abstract class OrderHistory {
  // El pedido que `requester` puede ver, o null si no existe o, para un comprador, es de otro cliente (el mismo
  // resultado, para no revelar que existe). Un administrador ve cualquiera
  abstract findVisible(
    id: string,
    requester: OrderRequester,
  ): Promise<OrderDetail | null>;

  // Los pedidos de un cliente, del más reciente al más antiguo (empata por id descendente). `after` es la posición del
  // último pedido de la página anterior: sigue valiendo aunque ese pedido ya no exista
  abstract listByCustomer(
    customerId: string,
    limit: number,
    after?: OrderPosition,
  ): Promise<OrderHistorySlice>;
}
