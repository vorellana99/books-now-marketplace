import { Controller, Get, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import {
  AccessTokenVerifier,
  TokenVerificationError,
} from '../../../src/platform/auth/access-token-verifier.js';
import type { AuthenticatedUser } from '../../../src/platform/auth/authenticated-user.js';
import { AuthModule } from '../../../src/platform/auth/auth.module.js';
import { Public } from '../../../src/platform/auth/public.decorator.js';
import { configureApp } from '../../../src/platform/http/configure-app.js';

const ANA: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'BUYER',
};

// Quien provee el verificador de tokens: aquí uno falso, que acepta solo "token-de-ana"
class FakeVerifier extends AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedUser> {
    return token === 'token-de-ana'
      ? Promise.resolve(ANA)
      : Promise.reject(new TokenVerificationError('invalid'));
  }
}

@Module({
  providers: [{ provide: AccessTokenVerifier, useClass: FakeVerifier }],
  exports: [AccessTokenVerifier],
})
class VerifierModule {}

// Un módulo que NO provee el verificador
@Module({})
class EmptyModule {}

@Controller('probe')
class ProbeController {
  @Get()
  closed() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('AuthModule', () => {
  let app: INestApplication | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function build(verifier: unknown) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AuthModule.register({ verifier: verifier as typeof VerifierModule }),
        ProbeModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    return request(app.getHttpServer());
  }

  describe('con un módulo que provee el verificador', () => {
    it('registra el guard global: una ruta sin decidir su acceso exige sesión (denegado por defecto)', async () => {
      const http = await build(VerifierModule);

      const res = await http.get('/probe').expect(401);

      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
    });

    it('con el token que el verificador acepta, la ruta responde', async () => {
      const http = await build(VerifierModule);

      await http
        .get('/probe')
        .set('Authorization', 'Bearer token-de-ana')
        .expect(200, { ok: true });
    });

    it('con un token que el verificador rechaza, 401', async () => {
      const http = await build(VerifierModule);

      await http
        .get('/probe')
        .set('Authorization', 'Bearer otro-token')
        .expect(401);
    });

    it('las rutas @Public siguen abiertas', async () => {
      const http = await build(VerifierModule);

      await http.get('/probe/open').expect(200, { ok: true });
    });
  });

  describe('sin quien provea el verificador', () => {
    it('la aplicación NO arranca: nunca queda abierta por olvido', async () => {
      await expect(
        Test.createTestingModule({
          imports: [
            AuthModule.register({ verifier: EmptyModule }),
            ProbeModule,
          ],
        }).compile(),
      ).rejects.toThrow(/AccessTokenVerifier/);
    });
  });
});
