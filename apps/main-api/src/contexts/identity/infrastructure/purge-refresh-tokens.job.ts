import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../platform/prisma/prisma.service.js';
import { runPurge } from '../../../platform/retention/purge-in-batches.js';

// Borra cada noche los tokens de refresco que vencieron, se usaron o se revocaron hace más de
// RETENTION_REFRESH_TOKEN_DAYS días. Un token vigente (sin usar, sin revocar y sin vencer) no se borra nunca, y uno usado
// se conserva un tiempo: la detección de reutilización necesita reconocerlo. Pasado el plazo, un token robado y ya usado se
// ve como desconocido (`401`) y deja de revocar su sesión
@Injectable()
export class PurgeRefreshTokensJob {
  private readonly logger = new Logger(PurgeRefreshTokensJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<number> {
    const days = this.config.getOrThrow<number>('RETENTION_REFRESH_TOKEN_DAYS');
    // SKIP LOCKED: dos instancias a la vez no se pisan
    return runPurge(
      this.logger,
      'refresh_tokens',
      days,
      (limit) =>
        this.prisma.$executeRaw`
        DELETE FROM identity.refresh_tokens
        WHERE id IN (
          SELECT id FROM identity.refresh_tokens
          WHERE expires_at < now() - make_interval(days => ${days})
             OR used_at < now() - make_interval(days => ${days})
             OR revoked_at < now() - make_interval(days => ${days})
          ORDER BY id
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED)`,
    );
  }
}
