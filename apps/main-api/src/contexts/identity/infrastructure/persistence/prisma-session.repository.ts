import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../../platform/prisma/generated/client.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { SessionRepository } from '../../domain/ports/session.repository.js';
import { Session } from '../../domain/model/session/session.aggregate.js';

interface TokenRow {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

@Injectable()
export class PrismaSessionRepository extends SessionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async open(session: Session): Promise<void> {
    await this.prisma.$transaction((tx) => this.persist(tx, session));
  }

  rotate<T>(
    tokenHash: string,
    decide: (session: Session | null) => Promise<T> | T,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.lock(tx, tokenHash);
      const result = await decide(session);
      if (session) await this.persist(tx, session);
      return result;
    });
  }

  async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.rotate(tokenHash, (session) => {
      session?.revoke(now);
    });
  }

  // SKIP LOCKED: dos instancias a la vez no se pisan
  async purgeFinished(olderThanDays: number, limit: number): Promise<number> {
    return this.prisma.$executeRaw`
      DELETE FROM identity.refresh_tokens
      WHERE id IN (
        SELECT id FROM identity.refresh_tokens
        WHERE expires_at < now() - make_interval(days => ${olderThanDays})
           OR used_at < now() - make_interval(days => ${olderThanDays})
           OR revoked_at < now() - make_interval(days => ${olderThanDays})
        ORDER BY id
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED)`;
  }

  // Bloquea la fila del token presentado: dos renovaciones simultáneas con el mismo token se ponen en fila, y la segunda
  // ya lo ve usado
  private async lock(
    tx: Prisma.TransactionClient,
    tokenHash: string,
  ): Promise<Session | null> {
    const [row] = await tx.$queryRaw<TokenRow[]>`
      SELECT id, user_id AS "userId", family_id AS "familyId", expires_at AS "expiresAt",
             used_at AS "usedAt", revoked_at AS "revokedAt"
      FROM identity.refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE`;
    if (!row) return null;
    return Session.restore({
      familyId: row.familyId,
      userId: row.userId,
      token: {
        id: row.id,
        hash: tokenHash,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
        revokedAt: row.revokedAt,
      },
    });
  }

  // El orden importa: primero se marca el token usado, luego nace el nuevo y por último se revoca la familia (que incluye
  // al nuevo, si lo hay)
  private async persist(
    tx: Prisma.TransactionClient,
    session: Session,
  ): Promise<void> {
    const { used, added, revokedAt } = session.changes();
    if (used) {
      await tx.refreshToken.update({
        where: { id: used.tokenId },
        data: { usedAt: used.at },
      });
    }
    if (added) {
      await tx.refreshToken.create({
        data: {
          id: added.id,
          userId: session.userId,
          familyId: session.familyId,
          tokenHash: added.hash,
          expiresAt: added.expiresAt,
        },
      });
    }
    if (revokedAt) {
      await tx.refreshToken.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt },
      });
    }
  }
}
