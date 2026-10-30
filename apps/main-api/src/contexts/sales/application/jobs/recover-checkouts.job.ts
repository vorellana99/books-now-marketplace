import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RequestContext } from '../../../../platform/observability/request-context.js';
import { CheckoutLog } from '../../domain/ports/checkout-log.port.js';
import { StockReservation } from '../../domain/ports/stock-reservation.port.js';
import { PaymentGateway } from '../../domain/ports/payment-gateway.port.js';

// Recupera las compras que se quedaron a medias (el proceso cayó o una compensación falló): reembolsa, libera la
// reserva y anula el checkout. Los tres pasos son idempotentes, así que repetirlos no hace daño
@Injectable()
export class RecoverCheckoutsJob {
  private readonly logger = new Logger(RecoverCheckoutsJob.name);

  constructor(
    private readonly checkouts: CheckoutLog,
    private readonly payments: PaymentGateway,
    private readonly stock: StockReservation,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<number> {
    const stale = await this.checkouts.claimStale(
      this.config.getOrThrow<number>('CHECKOUT_RECOVERY_MINUTES'),
    );
    for (const { orderId, requestId } of stale) {
      // Los logs de la recuperación llevan el mismo requestId que la compra original
      await RequestContext.run(requestId ?? `recovery-${orderId}`, () =>
        this.recover(orderId),
      );
    }
    return stale.length;
  }

  // Un checkout que falla no detiene a los demás: queda PENDING y se reintenta cuando venza su bloqueo
  private async recover(orderId: string): Promise<void> {
    try {
      // La compra pudo completarse después de reclamarse: reembolsar ahora dejaría un pedido sin cobro
      if (await this.checkouts.isCompleted(orderId)) return;
      await this.payments.refund(orderId);
      await this.stock.release(orderId);
      await this.checkouts.abort(orderId); // solo si las dos compensaciones terminaron
      this.logger.warn(
        `Checkout ${orderId} recuperado: reembolsado y liberado`,
      );
    } catch (error) {
      this.logger.error(
        `No se pudo recuperar ${orderId}; se reintenta cuando venza el bloqueo: ${String(error)}`,
      );
    }
  }
}
