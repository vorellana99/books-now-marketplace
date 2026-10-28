import { Injectable } from '@nestjs/common';
import { RequestContext } from '../../../../platform/observability/request-context.js';
import { Prisma } from '../../../../platform/prisma/generated/client.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import {
  CheckoutLog,
  RECOVERY_BATCH,
  RECOVERY_LOCK_MINUTES,
  type CheckoutRecord,
} from '../../domain/order/checkout-log.port.js';
import { Money } from '../../domain/shared/money.vo.js';

@Injectable()
export class PrismaCheckoutLog extends CheckoutLog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async start(
    orderId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<boolean> {
    try {
      await this.prisma.checkout.create({
        data: {
          orderId,
          idempotencyKey,
          requestHash,
          requestId: RequestContext.requestId() ?? null,
        },
      });
      return true;
    } catch (error) {
      // La clave es única en la base: si dos peticiones llegan a la vez, solo una entra
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return false;
      }
      throw error;
    }
  }

  async findByKey(idempotencyKey: string): Promise<CheckoutRecord | null> {
    const row = await this.prisma.checkout.findUnique({
      where: { idempotencyKey },
    });
    if (!row) return null;
    return {
      orderId: row.orderId,
      status: row.status,
      requestHash: row.requestHash,
      charged: this.chargedOf(row),
    };
  }

  async isCompleted(orderId: string): Promise<boolean> {
    const row = await this.prisma.checkout.findUnique({
      where: { orderId },
      select: { status: true },
    });
    return row?.status === 'COMPLETED';
  }

  // Solo cambia filas PENDING: nunca toca un COMPLETED
  async abort(orderId: string): Promise<void> {
    await this.prisma.checkout.updateMany({
      where: { orderId, status: 'PENDING' },
      data: { status: 'ABORTED' },
    });
  }

  // Reclama checkouts PENDING antiguos. SKIP LOCKED: dos instancias no toman los mismos; el bloqueo de 2 minutos
  // evita que otra vuelta los retome mientras esta los procesa. Las horas son del reloj de la base
  async claimStale(
    olderThanMinutes: number,
  ): Promise<{ orderId: string; requestId: string | null }[]> {
    const rows = await this.prisma.$queryRaw<
      { order_id: string; request_id: string | null }[]
    >`
      UPDATE sales.checkouts SET locked_until = now() + make_interval(mins => ${RECOVERY_LOCK_MINUTES})
      WHERE order_id IN (
        SELECT order_id FROM sales.checkouts
        WHERE status = 'PENDING'
          AND started_at < now() - (${olderThanMinutes} * interval '1 minute')
          AND (locked_until IS NULL OR locked_until < now())
        ORDER BY started_at
        LIMIT ${RECOVERY_BATCH}
        FOR UPDATE SKIP LOCKED)
      RETURNING order_id, request_id`;
    return rows.map((r) => ({ orderId: r.order_id, requestId: r.request_id }));
  }

  private chargedOf(row: {
    orderId: string;
    chargedAmount: Prisma.Decimal | null;
    currency: 'PEN' | 'USD' | null;
  }): Money | null {
    if (row.chargedAmount === null) return null;
    // Un monto sin moneda sería ambiguo: mejor fallar que responder un cobro inventado
    if (row.currency === null) {
      throw new Error(`El checkout ${row.orderId} tiene monto pero no moneda`);
    }
    return Money.of(row.chargedAmount.toString(), row.currency);
  }
}
