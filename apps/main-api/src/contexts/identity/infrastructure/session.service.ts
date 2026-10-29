import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../../../platform/prisma/generated/client.js';
import type { Role } from '../../../shared-kernel/role.js';
import { AccessTokenIssuer } from '../application/access-token-issuer.js';
import type { Session } from '../application/session.js';
import { generateRefreshToken } from '../domain/session/refresh-token.js';

const DAY_MS = 86_400_000;

// Abre una sesión (o la continúa): emite el token de acceso y guarda el token de refresco. Lo comparten el inicio de
// sesión, que abre una familia nueva, y la renovación, que sigue con la misma
@Injectable()
export class SessionService {
  private readonly refreshTtlMs: number;

  constructor(
    private readonly issuer: AccessTokenIssuer,
    config: ConfigService,
  ) {
    this.refreshTtlMs =
      config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  // Recibe la transacción (o el cliente) de quien lo llama: el token de refresco se guarda con el resto de su operación
  async open(
    db: Pick<Prisma.TransactionClient, 'refreshToken'>,
    user: { id: string; email: string; role: Role },
    familyId: string = randomUUID(),
  ): Promise<Session> {
    const refresh = generateRefreshToken();
    await db.refreshToken.create({
      data: {
        id: randomUUID(),
        userId: user.id,
        familyId,
        tokenHash: refresh.hash,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });
    const { token, expiresInSeconds } = await this.issuer.issue({
      id: user.id,
      role: user.role,
    });
    return {
      accessToken: token,
      expiresInSeconds,
      refreshToken: refresh.token,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
