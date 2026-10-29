import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import {
  GetOrderQuery,
  type OrderView,
} from '../../application/order/get-order.query.js';
import { toOrderView } from './order-view.js';

// Lado de lectura de CQRS: consulta con Prisma y arma la vista, sin reconstruir el agregado. Un comprador solo ve sus
// pedidos: el de otro cliente da el mismo NotFoundError que uno que no existe. No devuelve la dirección de envío (decisión
// D2 del corte 5: la vista pública del pedido no la lleva)
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ id, requester }: GetOrderQuery): Promise<OrderView> {
    // La condición va en la consulta y no después: el pedido ajeno no llega ni a leerse
    const order = await this.prisma.order.findFirst({
      where:
        requester.role === 'ADMIN'
          ? { id }
          : { id, customerId: requester.userId },
      include: { lines: true },
    });
    if (!order) throw new NotFoundError('Order', id);
    return toOrderView(order);
  }
}
