import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import {
  GetOrderQuery,
  type OrderView,
} from '../../application/order/get-order.query.js';

// Lado de lectura de CQRS: consulta con Prisma y arma la vista, sin reconstruir el agregado
@QueryHandler(GetOrderQuery)
export class GetOrderHandler implements IQueryHandler<GetOrderQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ id }: GetOrderQuery): Promise<OrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: { orderBy: { isbn: 'asc' } } }, // orden estable, no el físico
    });
    if (!order) throw new NotFoundError('Order', id);
    return {
      id: order.id,
      status: order.status,
      // Prisma.Decimal → texto con 2 decimales; el monto nunca pasa por number
      charged: {
        amount: order.chargedAmount.toFixed(2),
        currency: order.currency,
      },
      lines: order.lines.map((line) => ({
        isbn: line.isbn,
        title: line.title,
        // La BD guarda 6 decimales (para facturar); la API muestra 2
        unitPrice: {
          amount: line.unitPrice.toFixed(2),
          currency: line.currency,
        },
        quantity: line.quantity,
      })),
    };
  }
}
