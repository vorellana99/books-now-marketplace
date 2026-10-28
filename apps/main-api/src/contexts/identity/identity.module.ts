import { randomBytes } from 'node:crypto';
import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxModule } from '../../platform/outbox/outbox.module.js';
import { AccessTokenVerifier } from '../../platform/auth/access-token-verifier.js';
import { AccessTokenIssuer } from './application/access-token-issuer.js';
import { PasswordHasher } from './domain/password-hasher.port.js';
import { AuthController } from './infrastructure/auth.controller.js';
import { JwtTokenService } from './infrastructure/jwt-token.service.js';
import { LoginHandler } from './infrastructure/login.handler.js';
import { LogoutHandler } from './infrastructure/logout.handler.js';
import { RefreshSessionHandler } from './infrastructure/refresh-session.handler.js';
import { RegisterUserHandler } from './infrastructure/register-user.handler.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.js';
import { SessionService } from './infrastructure/session.service.js';

@Module({
  imports: [OutboxModule], // RegisterUserHandler guarda el evento del usuario con OutboxWriter
  controllers: [AuthController],
  providers: [
    SessionService,
    RegisterUserHandler,
    LoginHandler,
    RefreshSessionHandler,
    LogoutHandler,
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
