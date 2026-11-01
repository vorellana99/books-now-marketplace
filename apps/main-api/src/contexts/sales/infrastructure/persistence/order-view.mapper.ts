import type { Prisma } from '../../../../platform/prisma/generated/client.js';
import type {
  OrderDetail,
  OrderHistoryItem,
  OrderView,
  ShippingAddressView,
} from '../../domain/model/order/order-view.js';

type OrderRow = Prisma.OrderGetPayload<{ include: { lines: true } }>;

// El pedido como lo muestra la API. Prisma.Decimal → texto con 2 decimales: el monto nunca pasa por number
export function toOrderView(order: OrderRow): OrderView {
  return {
    id: order.id,
    status: order.status,
    charged: {
      amount: order.chargedAmount.toFixed(2),
      currency: order.currency,
    },
    // Orden estable por ISBN, no el físico
    lines: [...order.lines]
      .sort((a, b) => (a.isbn < b.isbn ? -1 : a.isbn > b.isbn ? 1 : 0))
      .map((line) => ({
        isbn: line.isbn,
        title: line.title,
        // La base guarda 6 decimales (para facturar); la API muestra 2
        unitPrice: {
          amount: line.unitPrice.toFixed(2),
          currency: line.currency,
        },
        quantity: line.quantity,
      })),
  };
}

// Las siete columnas, o null si el pedido es anterior a la dirección
function addressOf(order: OrderRow): ShippingAddressView | null {
  if (order.shipRecipient === null) return null;
  return {
    recipient: order.shipRecipient,
    phone: order.shipPhone ?? '',
    line1: order.shipLine1 ?? '',
    district: order.shipDistrict ?? '',
    province: order.shipProvince ?? '',
    department: order.shipDepartment ?? '',
    reference: order.shipReference,
  };
}

// El pedido con su dirección: lo que ve su dueño o un administrador
export function toOrderDetail(order: OrderRow): OrderDetail {
  return { ...toOrderView(order), shippingAddress: addressOf(order) };
}

export function toHistoryItem(order: OrderRow): OrderHistoryItem {
  return {
    ...toOrderDetail(order),
    createdAt: order.createdAt.toISOString(),
  };
}
