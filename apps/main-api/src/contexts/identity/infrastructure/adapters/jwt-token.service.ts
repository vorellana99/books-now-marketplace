import { randomUUID } from 'node:crypto';
import { errors, jwtVerify, SignJWT } from 'jose';
import {
  TokenVerificationError,
  type AccessTokenVerifier,
} from '../../../../platform/auth/access-token-verifier.js';
import type { AuthenticatedUser } from '../../../../platform/auth/authenticated-user.js';
import { ROLES, type Role } from '../../../../shared-kernel/role.js';
import {
  AccessTokenIssuer,
  type IssuedAccessToken,
} from '../../domain/ports/access-token-issuer.js';

export const TOKEN_ISSUER = 'libroya';
export const TOKEN_AUDIENCE = 'libroya-api';
const ALGORITHM = 'HS256';
const CLOCK_TOLERANCE_SECONDS = 5;
const MIN_SECRET_LENGTH = 32;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 3600;
const MAX_TOKEN_LENGTH = 4096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Token de acceso: un JWT firmado con HS256 que vive pocos minutos y solo lleva quién es el usuario (sub) y su rol.
// Emite y verifica; el guard de las rutas solo conoce el puerto AccessTokenVerifier. Solo acepta HS256, con emisor y
// audiencia propios, así que ni un token sin firma ni uno firmado con otro algoritmo y el mismo secreto sirven
export class JwtTokenService
  extends AccessTokenIssuer
  implements AccessTokenVerifier
{
  private readonly key: Uint8Array;
  private readonly ttlSeconds: number;
  private readonly clock: () => Date;

  constructor(options: {
    secret: string;
    ttlSeconds: number;
    clock?: () => Date;
  }) {
    super();
    if (
      typeof options.secret !== 'string' ||
      options.secret.length < MIN_SECRET_LENGTH
    ) {
      throw new Error(
        `El secreto del token debe tener al menos ${MIN_SECRET_LENGTH} caracteres`,
      );
    }
    if (
      !Number.isInteger(options.ttlSeconds) ||
      options.ttlSeconds < MIN_TTL_SECONDS ||
      options.ttlSeconds > MAX_TTL_SECONDS
    ) {
      throw new Error(
        `La duración del token debe ser un entero de ${MIN_TTL_SECONDS} a ${MAX_TTL_SECONDS} segundos`,
      );
    }
    this.key = new TextEncoder().encode(options.secret);
    this.ttlSeconds = options.ttlSeconds;
    this.clock = options.clock ?? (() => new Date());
  }

  async issue(user: { id: string; role: Role }): Promise<IssuedAccessToken> {
    const issuedAt = Math.floor(this.clock().getTime() / 1000);
    const token = await new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
      .setIssuer(TOKEN_ISSUER)
      .setAudience(TOKEN_AUDIENCE)
      .setSubject(user.id)
      .setJti(randomUUID())
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + this.ttlSeconds)
      .sign(this.key);
    return { token, expiresInSeconds: this.ttlSeconds };
  }

  async verify(token: string): Promise<AuthenticatedUser> {
    if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) {
      throw new TokenVerificationError('invalid');
    }
    const now = this.clock();
    let payload;
    try {
      ({ payload } = await jwtVerify(token, this.key, {
        algorithms: [ALGORITHM],
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        typ: 'JWT',
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        currentDate: now,
      }));
    } catch (error) {
      throw new TokenVerificationError(
        error instanceof errors.JWTExpired ? 'expired' : 'invalid',
      );
    }

    const { sub, role, iat, exp } = payload;
    const nowSeconds = Math.floor(now.getTime() / 1000);
    if (
      typeof sub !== 'string' ||
      !UUID.test(sub) ||
      !ROLES.includes(role as Role) ||
      typeof iat !== 'number' ||
      typeof exp !== 'number' ||
      iat > nowSeconds + CLOCK_TOLERANCE_SECONDS || // emitido en el futuro
      exp - iat > this.ttlSeconds // vive más de lo que este servicio emite
    ) {
      throw new TokenVerificationError('invalid');
    }
    return { userId: sub, role: role as Role };
  }
}
