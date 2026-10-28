import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from '../../application/order/list-customer-orders.query.js';
import { OrderCursor } from './order-cursor.js';
import { toHistoryItem } from './order-view.js';

@QueryHandler(ListCustomerOrdersQuery)
export class ListCustomerOrdersHandler implements IQueryHandler<ListCustomerOrdersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    customerId,
    limit,
    after,
  }: ListCustomerOrdersQuery): Promise<OrderHistoryPage> {
    const rows = await this.prisma.order.findMany({
      where: {
        customerId,
        // Paginación por posición: lo que viene DESPUÉS del último pedido de la página anterior, en el mismo orden
        // (fecha desc, id desc). No usa el cursor de Prisma: este sigue valiendo aunque ese pedido ya no exista
        ...(after && {
          OR: [
            { createdAt: { lt: after.createdAt } },
            { createdAt: after.createdAt, id: { lt: after.id } },
          ],
        }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // uno de más para saber si hay otra página, sin una consulta aparte
      include: { lines: true },
    });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(toHistoryItem),
      nextCursor:
        rows.length > limit && last
          ? OrderCursor.encode({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }
}
