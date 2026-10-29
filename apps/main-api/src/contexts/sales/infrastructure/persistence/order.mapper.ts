import type { Prisma } from '../../../../platform/prisma/generated/client.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { Order } from '../../domain/order/order.aggregate.js';
import { ShippingAddress } from '../../domain/order/shipping-address.vo.js';
import { Money, type Currency } from '../../domain/shared/money.vo.js';

type OrderRow = Prisma.OrderGetPayload<{ include: { lines: true } }>;

// La dirección se guarda en siete columnas. Todas en null es un pedido anterior a la dirección; a medias es un dato
// roto (la base lo impide con una CHECK, y esto lo vuelve a comprobar al leer)
function addressOf(row: OrderRow): ShippingAddress | null {
  const required = [
    row.shipRecipient,
    row.shipPhone,
    row.shipLine1,
    row.shipDistrict,
    row.shipProvince,
    row.shipDepartment,
  ];
  if (required.every((v) => v === null) && row.shipReference === null) {
    return null;
  }
  if (required.some((v) => v === null)) {
    throw new Error(
      `La dirección de envío del pedido ${row.id} está incompleta`,
    );
  }
  return ShippingAddress.restore({
    recipient: row.shipRecipient!,
    phone: row.shipPhone!,
    line1: row.shipLine1!,
    district: row.shipDistrict!,
    province: row.shipProvince!,
    department: row.shipDepartment!,
    reference: row.shipReference,
  });
}

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
      shippingAddress: addressOf(row),
    });
  },

  toCreate(order: Order, chargedAmount: string, currency: Currency) {
    return {
      id: order.id,
      customerId: order.customerId,
      status: 'PLACED' as const,
      chargedAmount, // texto con 2 decimales: Prisma lo acepta en una columna Decimal
      currency,
      shipRecipient: order.shippingAddress?.recipient ?? null,
      shipPhone: order.shippingAddress?.phone ?? null,
      shipLine1: order.shippingAddress?.line1 ?? null,
      shipDistrict: order.shippingAddress?.district ?? null,
      shipProvince: order.shippingAddress?.province ?? null,
      shipDepartment: order.shippingAddress?.department ?? null,
      shipReference: order.shippingAddress?.reference ?? null,
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
