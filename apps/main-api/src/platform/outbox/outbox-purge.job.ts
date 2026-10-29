import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { runPurge } from '../retention/purge-in-batches.js';

// Borra cada noche los mensajes del outbox con más de RETENTION_OUTBOX_DAYS días cuyas entregas están todas hechas
// (DONE); sus entregas se van con ellos (ON DELETE CASCADE). Un mensaje con una entrega PENDING o FAILED no se borra
// nunca: un evento sin entregar no se oculta por ser viejo
@Injectable()
export class OutboxPurgeJob {
  private readonly logger = new Logger(OutboxPurgeJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<number> {
    const days = this.config.getOrThrow<number>('RETENTION_OUTBOX_DAYS');
    // SKIP LOCKED: dos instancias a la vez no se pisan
    return runPurge(
      this.logger,
      'outbox',
      days,
      (limit) =>
        this.prisma.$executeRaw`
        DELETE FROM messaging.outbox
        WHERE id IN (
          SELECT m.id FROM messaging.outbox m
          WHERE m.occurred_on < now() - make_interval(days => ${days})
            AND NOT EXISTS (
              SELECT 1 FROM messaging.deliveries d
              WHERE d.event_id = m.id AND d.status <> 'DONE')
          ORDER BY m.id
          LIMIT ${limit}
          FOR UPDATE OF m SKIP LOCKED)`,
    );
  }
}
