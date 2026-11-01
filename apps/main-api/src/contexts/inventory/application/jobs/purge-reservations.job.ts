import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { runPurge } from '../../../../platform/retention/purge-in-batches.js';
import { StockRepository } from '../../domain/ports/stock.repository.js';

// Borra cada noche las reservas CONFIRMED con más de RETENTION_RESERVATION_DAYS días. Una HELD no se toca nunca: sigue
// reteniendo stock. Las cantidades de stock_items no cambian: ya descontaron al reservar
@Injectable()
export class PurgeReservationsJob {
  private readonly logger = new Logger(PurgeReservationsJob.name);

  constructor(
    private readonly stock: StockRepository,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<number> {
    const days = this.config.getOrThrow<number>('RETENTION_RESERVATION_DAYS');
    return runPurge(this.logger, 'reservations', days, (limit) =>
      this.stock.purgeConfirmed(days, limit),
    );
  }
}
