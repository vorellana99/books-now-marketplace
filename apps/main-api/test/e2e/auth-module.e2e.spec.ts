import type { INestApplication } from '@nestjs/common';
import { ApplicationConfig } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AuthThrottlerGuard } from '../../src/contexts/identity/infrastructure/auth-throttler.js';
import { AuthGuard } from '../../src/platform/auth/auth.guard.js';
import { createTestApp } from '../support/nest.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';

const guardClasses = (app: INestApplication) =>
  app
    .get(ApplicationConfig)
    .getGlobalGuards()
    .map((guard) => guard.constructor);

describe('AuthModule en la aplicación (e2e)', () => {
  it('AppModule registra los dos guards globales y el límite de intentos va PRIMERO', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    try {
      // El límite corta un intento antes de gastar siquiera la verificación del token
      expect(guardClasses(app)).toEqual([AuthThrottlerGuard, AuthGuard]);
    } finally {
      await app.close();
    }
  });

  it('IdentityModule por sí solo ya NO registra el guard de autenticación: eso es del AuthModule', async () => {
    const app = await createTestApp(OutboxModule, IdentityModule);
    try {
      expect(guardClasses(app)).toEqual([AuthThrottlerGuard]);
    } finally {
      await app.close();
    }
  });
});
