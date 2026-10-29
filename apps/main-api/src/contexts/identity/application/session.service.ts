import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionRepository } from '../domain/ports/session.repository.js';
import { Session } from '../domain/session/session.aggregate.js';
import type { User } from '../domain/user.aggregate.js';
import { AccessTokenIssuer } from './access-token-issuer.js';
import type { Session as SessionTokens } from './session.js';

const DAY_MS = 86_400_000;

// Lo que comparten el inicio de sesión y la renovación: cuánto dura un token de refresco, y armar la respuesta (token de
// acceso, token de refresco y usuario) una vez que las reglas de la sesión ya decidieron
@Injectable()
export class SessionService {
  readonly ttlMs: number;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly issuer: AccessTokenIssuer,
    config: ConfigService,
  ) {
    this.ttlMs = config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * DAY_MS;
  }

  // Abre una sesión nueva (una familia nueva). El token de acceso se emite antes de guardar: si no se puede emitir, no
  // queda ningún token de refresco huérfano
  async start(user: User): Promise<SessionTokens> {
    const { session, refreshToken } = Session.start({
      userId: user.id,
      now: new Date(),
      ttlMs: this.ttlMs,
    });
    const view = await this.finish(user, refreshToken);
    await this.sessions.open(session);
    return view;
  }

  // La respuesta de una sesión: emite el token de acceso del usuario y lo junta con el de refresco ya decidido
  async finish(user: User, refreshToken: string): Promise<SessionTokens> {
    const { token, expiresInSeconds } = await this.issuer.issue({
      id: user.id,
      role: user.role,
    });
    return {
      accessToken: token,
      expiresInSeconds,
      refreshToken,
      user: { id: user.id, email: user.email.value, role: user.role },
    };
  }
}
