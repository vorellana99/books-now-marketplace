import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { runPurge } from '../../../../platform/retention/purge-in-batches.js';

// Borra cada noche las reservas CONFIRMED con más de RETENTION_RESERVATION_DAYS días. Una HELD no se toca nunca: sigue
// reteniendo stock. Las cantidades de stock_items no cambian: ya descontaron al reservar
@Injectable()
export class PurgeReservationsJob {
  private readonly logger = new Logger(PurgeReservationsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<number> {
    const days = this.config.getOrThrow<number>('RETENTION_RESERVATION_DAYS');
    // SKIP LOCKED: dos instancias a la vez no se pisan
    return runPurge(
      this.logger,
      'reservations',
      days,
      (limit) =>
        this.prisma.$executeRaw`
        DELETE FROM inventory.reservations
        WHERE (order_id, isbn) IN (
          SELECT order_id, isbn FROM inventory.reservations
          WHERE status = 'CONFIRMED'
            AND created_at < now() - make_interval(days => ${days})
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)`,
    );
  }
}
