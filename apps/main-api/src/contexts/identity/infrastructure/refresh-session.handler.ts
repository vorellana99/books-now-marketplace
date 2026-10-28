import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../platform/prisma/prisma.service.js';
import { AuthenticationError } from '../../../shared-kernel/domain.errors.js';
import { RefreshSessionCommand } from '../application/refresh-session.command.js';
import type { Session } from '../application/session.js';
import { hashRefreshToken, isWellFormedRefreshToken } from './refresh-token.js';
import { SessionService } from './session.service.js';

type Outcome =
  | { kind: 'renewed'; session: Session }
  | { kind: 'invalid' }
  | { kind: 'reused'; userId: string; familyId: string };

interface TokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

const invalidRefreshToken = () =>
  new AuthenticationError(
    'INVALID_REFRESH_TOKEN',
    'La sesión no es válida o venció: inicie sesión de nuevo',
  );

@CommandHandler(RefreshSessionCommand)
export class RefreshSessionHandler implements ICommandHandler<RefreshSessionCommand> {
  private readonly logger = new Logger(RefreshSessionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async execute({ refreshToken }: RefreshSessionCommand): Promise<Session> {
    if (!isWellFormedRefreshToken(refreshToken)) throw invalidRefreshToken();
    const hash = hashRefreshToken(refreshToken);

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<Outcome> => {
        // Bloquea la fila: dos renovaciones simultáneas con el mismo token se ponen en fila, y la segunda ya lo ve usado
        const [row] = await tx.$queryRaw<TokenRow[]>`
          SELECT id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt",
                 used_at AS "usedAt", revoked_at AS "revokedAt"
          FROM identity.refresh_tokens WHERE token_hash = ${hash} FOR UPDATE`;
        const now = new Date();
        if (!row || row.revokedAt || row.expiresAt <= now) {
          return { kind: 'invalid' };
        }

        if (row.usedAt) {
          // Un token que ya se cambió por otro vuelve a presentarse: o se copió, o alguien lo robó. No se sabe cuál de
          // los dos tiene la sesión, así que se revoca entera. Se hace dentro de la transacción y se avisa al
          // terminar: lanzar aquí la desharía
          await tx.refreshToken.updateMany({
            where: { familyId: row.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'reused', userId: row.userId, familyId: row.familyId };
        }

        await tx.refreshToken.update({
          where: { id: row.id },
          data: { usedAt: now },
        });
        // El rol se lee de nuevo: un cambio de rol vale desde la siguiente renovación
        const user = await tx.user.findUniqueOrThrow({
          where: { id: row.userId },
        });
        return {
          kind: 'renewed',
          session: await this.sessions.open(tx, user, row.familyId),
        };
      },
    );

    if (outcome.kind === 'renewed') return outcome.session;
    if (outcome.kind === 'reused') {
      this.logger.warn(
        `Se reutilizó un token de refresco ya usado: se revocó la sesión ${outcome.familyId} del usuario ${outcome.userId}`,
      );
    }
    throw invalidRefreshToken();
  }
}
