import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordHasher } from './domain/password-hasher.port.js';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher.js';

@Module({
  providers: [
    {
      provide: PasswordHasher,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PasswordHasher =>
        new ScryptPasswordHasher({
          logN: config.getOrThrow<number>('PASSWORD_HASH_LOG_N'),
        }),
    },
  ],
  exports: [PasswordHasher],
})
export class IdentityModule {}
