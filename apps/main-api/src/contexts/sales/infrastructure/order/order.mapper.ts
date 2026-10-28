import type { Prisma } from '../../../../platform/prisma/generated/client.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { Order } from '../../domain/order/order.aggregate.js';
import { Money, type Currency } from '../../domain/shared/money.vo.js';

type OrderRow = Prisma.OrderGetPayload<{ include: { lines: true } }>;

// Convierte en el borde, siempre a través de texto: Prisma.Decimal es una copia propia de decimal.js dentro del
// cliente generado, así que no se mezcla con la del dominio ni pasa por number
export const OrderMapper = {
  toDomain(row: OrderRow): Order {
    return Order.restore({
      id: row.id,
      customerId: row.customerId,
      lines: row.lines.map((line) => ({
        isbn: Isbn.create(line.isbn),
        title: line.title,
        unitPrice: Money.of(line.unitPrice.toString(), line.currency),
        quantity: line.quantity,
      })),
    });
  },

  toCreate(order: Order, chargedAmount: string, currency: Currency) {
    return {
      id: order.id,
      customerId: order.customerId,
      status: 'PLACED' as const,
      chargedAmount, // texto con 2 decimales: Prisma lo acepta en una columna Decimal
      currency,
      lines: {
        create: order.getLines().map((line) => ({
          isbn: line.isbn.value,
          title: line.title,
          unitPrice: line.unitPrice.amount.toString(), // se guarda con la escala de la columna (6)
          currency: line.unitPrice.currency,
          quantity: line.quantity,
        })),
      },
    };
  },
};
