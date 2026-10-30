import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { OutboxWriter } from '../../../../platform/outbox/outbox.writer.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import {
  ConflictError,
  DomainError,
} from '../../../../shared-kernel/domain.errors.js';
import type { Order } from '../../domain/order/order.aggregate.js';
import { OrderRepository } from '../../domain/ports/order.repository.js';
import type { Money } from '../../domain/shared/money.vo.js';
import { OrderMapper } from './order.mapper.js';

@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {
    super();
  }

  nextId(): string {
    return randomUUID();
  }

  async findById(id: string): Promise<Order | null> {
    const row = await this.prisma.order.findUnique({
      where: { id },
      include: { lines: { orderBy: { isbn: 'asc' } } }, // orden estable, no el físico
    });
    return row ? OrderMapper.toDomain(row) : null;
  }

  // Pedido, líneas, checkout COMPLETED y evento en una sola transacción: o todo o nada.
  // El checkout solo se completa si sigue PENDING: si la recuperación ya reembolsó, liberó y lo anuló mientras este
  // proceso seguía vivo, crear el pedido dejaría un pedido sin cobro y sin stock
  async save(order: Order, charged: Money): Promise<void> {
    if (order.status !== 'PLACED') {
      throw new DomainError(
        'ORDER_NOT_PLACED',
        'Solo se guarda un pedido confirmado',
      );
    }
    if (!order.shippingAddress) {
      throw new DomainError(
        'SHIPPING_ADDRESS_REQUIRED',
        'Solo se guarda un pedido con dirección de envío',
      );
    }
    if (charged.currency !== order.currency) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        'El monto cobrado debe estar en la moneda del pedido',
      );
    }
    const final = charged.toFinal(); // se redondea una sola vez, aquí
    const events = order.pullEvents();

    await this.prisma.$transaction(async (tx) => {
      const completed = await tx.checkout.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: {
          status: 'COMPLETED',
          chargedAmount: final.amount.toFixed(2),
          currency: final.currency,
        },
      });
      if (completed.count === 0) {
        throw new ConflictError(
          'CHECKOUT_NOT_PENDING',
          `El checkout del pedido ${order.id} ya no está pendiente`,
        );
      }
      await tx.order.create({
        data: OrderMapper.toCreate(
          order,
          final.amount.toFixed(2),
          final.currency,
        ),
      });
      await this.outbox.append(tx, events);
    });
  }
}
