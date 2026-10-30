import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxModule } from '../../platform/outbox/outbox.module.js';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AccessTokenVerifier } from '../../platform/auth/access-token-verifier.js';
import { AccessTokenIssuer } from './domain/ports/access-token-issuer.port.js';
import { PasswordHasher } from './domain/ports/password-hasher.port.js';
import { SessionRepository } from './domain/ports/session.repository.js';
import { UserRepository } from './domain/ports/user.repository.js';
import { PrismaSessionRepository } from './infrastructure/persistence/prisma-session.repository.js';
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository.js';
import { AuthController } from './infrastructure/http/auth.controller.js';
import {
  AuthThrottlerGuard,
  authThrottlers,
} from './infrastructure/http/auth-throttler.js';
import { JwtTokenService } from './infrastructure/adapters/jwt-token.service.js';
import { LoginHandler } from './application/use-cases/session/login.handler.js';
import { LogoutHandler } from './application/use-cases/session/logout.handler.js';
import { PurgeRefreshTokensJob } from './application/jobs/purge-refresh-tokens.job.js';
import { RefreshSessionHandler } from './application/use-cases/session/refresh-session.handler.js';
import { RegisterUserHandler } from './application/use-cases/user/register-user.handler.js';
import { ScryptPasswordHasher } from './infrastructure/adapters/scrypt-password-hasher.js';
import { SessionService } from './application/services/session.service.js';

@Module({
  imports: [
    OutboxModule, // RegisterUserHandler guarda el evento del usuario con OutboxWriter
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: authThrottlers(config),
        setHeaders: false, // los contadores internos no se muestran: solo Retry-After al cortar
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    // El límite de intentos va antes que el resto de los guards: un intento cortado no gasta ni la verificación del token
    { provide: APP_GUARD, useClass: AuthThrottlerGuard },
    { provide: SessionRepository, useClass: PrismaSessionRepository },
    { provide: UserRepository, useClass: PrismaUserRepository },
    SessionService,
    RegisterUserHandler,
    LoginHandler,
    RefreshSessionHandler,
    LogoutHandler,
    PurgeRefreshTokensJob,
    {
      provide: PasswordHasher,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PasswordHasher =>
        new ScryptPasswordHasher({
          logN: config.getOrThrow<number>('PASSWORD_HASH_LOG_N'),
        }),
    },
    {
      provide: JwtTokenService,
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtTokenService => {
        let secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          // Solo fuera de producción (el esquema de entorno lo exige allí). No hay un secreto "por defecto" en el
          // código: cada proceso inventa el suyo, y los tokens dejan de valer al reiniciar
          secret = randomBytes(48).toString('base64url');
          new Logger('IdentityModule').warn(
            'JWT_SECRET no está definido: se usa un secreto aleatorio y los tokens dejarán de valer al reiniciar',
          );
        }
        return new JwtTokenService({
          secret,
          ttlSeconds: config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS'),
        });
      },
    },
    { provide: AccessTokenIssuer, useExisting: JwtTokenService },
    { provide: AccessTokenVerifier, useExisting: JwtTokenService },
  ],
  exports: [PasswordHasher, AccessTokenIssuer, AccessTokenVerifier],
})
export class IdentityModule {}
