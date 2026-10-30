import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import type {
  OrderDetail,
  OrderPosition,
  OrderRequester,
} from '../../domain/order/order-view.js';
import {
  OrderHistory,
  type OrderHistorySlice,
} from '../../domain/ports/order-history.js';
import { toHistoryItem, toOrderDetail } from './order-view.mapper.js';

// El lado de lectura con Prisma: consulta y arma la vista, sin reconstruir el agregado
@Injectable()
export class PrismaOrderHistory extends OrderHistory {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findVisible(
    id: string,
    requester: OrderRequester,
  ): Promise<OrderDetail | null> {
    // La condición va en la consulta y no después: el pedido ajeno no llega ni a leerse
    const order = await this.prisma.order.findFirst({
      where:
        requester.role === 'ADMIN'
          ? { id }
          : { id, customerId: requester.userId },
      include: { lines: true },
    });
    return order ? toOrderDetail(order) : null;
  }

  async listByCustomer(
    customerId: string,
    limit: number,
    after?: OrderPosition,
  ): Promise<OrderHistorySlice> {
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
      next:
        rows.length > limit && last
          ? { createdAt: last.createdAt, id: last.id }
          : null,
    };
  }
}
