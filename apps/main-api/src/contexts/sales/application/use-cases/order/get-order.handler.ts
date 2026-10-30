import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { NotFoundError } from '../../../../../shared-kernel/domain.errors.js';
import { OrderHistory } from '../../../domain/ports/order-history.port.js';
import { GetOrderQuery, type OrderDetail } from './get-order.query.js';

// Lado de lectura de CQRS: pide la vista al puerto, sin reconstruir el agregado. Un comprador solo ve sus pedidos: el de
// otro cliente da el mismo NotFoundError que uno que no existe. Como solo lo ve su dueño o un administrador, devuelve
// también la dirección de envío (DP-15; antes, sin autenticación, no la llevaba)
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly history: OrderHistory) {}

  async execute({ id, requester }: GetOrderQuery): Promise<OrderDetail> {
    const order = await this.history.findVisible(id, requester);
    if (!order) throw new NotFoundError('Order', id);
    return order;
  }
}
