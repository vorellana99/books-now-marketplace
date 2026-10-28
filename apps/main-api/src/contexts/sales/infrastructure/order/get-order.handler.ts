import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import {
  GetOrderQuery,
  type OrderView,
} from '../../application/order/get-order.query.js';
import { toOrderView } from './order-view.js';

// Lado de lectura de CQRS: consulta con Prisma y arma la vista, sin reconstruir el agregado. No devuelve la dirección de
// envío: el endpoint no tiene autenticación (decisión D2)
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ id }: GetOrderQuery): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!order) throw new NotFoundError('Order', id);
    return toOrderView(order);
  }
}
