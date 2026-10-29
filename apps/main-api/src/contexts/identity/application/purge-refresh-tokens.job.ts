import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { runPurge } from '../../../platform/retention/purge-in-batches.js';
import { SessionRepository } from '../domain/ports/session.repository.js';

// Borra cada noche los tokens de refresco que vencieron, se usaron o se revocaron hace más de
// RETENTION_REFRESH_TOKEN_DAYS días. Un token vigente (sin usar, sin revocar y sin vencer) no se borra nunca, y uno usado
// se conserva un tiempo: la detección de reutilización necesita reconocerlo. Pasado el plazo, un token robado y ya usado se
// ve como desconocido (`401`) y deja de revocar su sesión
@Injectable()
export class PurgeRefreshTokensJob {
  private readonly logger = new Logger(PurgeRefreshTokensJob.name);

  constructor(
    private readonly sessions: SessionRepository,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<number> {
    const days = this.config.getOrThrow<number>('RETENTION_REFRESH_TOKEN_DAYS');
    return runPurge(this.logger, 'refresh_tokens', days, (limit) =>
      this.sessions.purgeFinished(days, limit),
    );
  }
}
