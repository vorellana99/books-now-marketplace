import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { runPurge } from '../../../../platform/retention/purge-in-batches.js';
import { CheckoutLog } from '../../domain/order/checkout-log.port.js';

// Borra cada noche los checkouts ya terminados (COMPLETED o ABORTED) con más de RETENTION_CHECKOUT_DAYS días. Un PENDING
// no se toca nunca. Purgar un checkout olvida su Idempotency-Key: pasado el plazo, la misma clave ya no devuelve el pedido
@Injectable()
export class PurgeCheckoutsJob {
  private readonly logger = new Logger(PurgeCheckoutsJob.name);

  constructor(
    private readonly checkouts: CheckoutLog,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<number> {
    const days = this.config.getOrThrow<number>('RETENTION_CHECKOUT_DAYS');
    return runPurge(this.logger, 'checkouts', days, (limit) =>
      this.checkouts.purgeFinished(days, limit),
    );
  }
}
