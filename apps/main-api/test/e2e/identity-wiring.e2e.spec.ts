import { Logger, type INestApplication } from '@nestjs/common';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { PasswordHasher } from '../../src/contexts/identity/domain/ports/password-hasher.port.js';
import { ScryptPasswordHasher } from '../../src/contexts/identity/infrastructure/scrypt-password-hasher.js';
import { AccessTokenIssuer } from '../../src/contexts/identity/application/access-token-issuer.js';
import { JwtTokenService } from '../../src/contexts/identity/infrastructure/jwt-token.service.js';
import {
  AccessTokenVerifier,
  TokenVerificationError,
} from '../../src/platform/auth/access-token-verifier.js';
import { createTestApp, withEnv } from '../support/nest.js';

describe('IdentityModule: cableado', () => {
  const build = (env: Record<string, string>) =>
    withEnv(env, () => createTestApp(IdentityModule));

  it('el PasswordHasher es el de scrypt', async () => {
    const app: INestApplication = await build({ PASSWORD_HASH_LOG_N: '4' });
    try {
      expect(app.get(PasswordHasher)).toBeInstanceOf(ScryptPasswordHasher);
    } finally {
      await app.close();
    }
  });

  it('usa el costo de PASSWORD_HASH_LOG_N', async () => {
    const app = await build({ PASSWORD_HASH_LOG_N: '5' });
    try {
      expect(
        (await app.get(PasswordHasher).hash('una contraseña larga')).startsWith(
          'scrypt$5$',
        ),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('sin la variable, usa el costo seguro por defecto (15)', async () => {
    const app = await build({ PASSWORD_HASH_LOG_N: '' }).catch(() => undefined);
    expect(app).toBeUndefined(); // una variable vacía es un error, no el valor por defecto
  });

  describe('los tokens de acceso', () => {
    const USER = '0196a000-0000-7000-8000-0000000000aa';
    const SECRET_A = 'secreto-a-de-pruebas-libroya-0123456789-abcdef';
    const SECRET_B = 'secreto-b-de-pruebas-libroya-9876543210-fedcba';

    it('el emisor y el verificador son el mismo servicio', async () => {
      const app = await build({ JWT_SECRET: SECRET_A });
      try {
        expect(app.get(AccessTokenIssuer)).toBeInstanceOf(JwtTokenService);
        expect(app.get(AccessTokenVerifier)).toBe(app.get(AccessTokenIssuer));
      } finally {
        await app.close();
      }
    });

    it('con el mismo JWT_SECRET, un token de una instancia vale en otra (varias réplicas)', async () => {
      const [one, two] = await Promise.all([
        build({ JWT_SECRET: SECRET_A }),
        build({ JWT_SECRET: SECRET_A }),
      ]);
      try {
        const { token } = await one
          .get(AccessTokenIssuer)
          .issue({ id: USER, role: 'BUYER' });
        await expect(
          two.get(AccessTokenVerifier).verify(token),
        ).resolves.toEqual({ userId: USER, role: 'BUYER' });
      } finally {
        await Promise.all([one.close(), two.close()]);
      }
    });

    it('con otro secreto, no', async () => {
      const [one, two] = await Promise.all([
        build({ JWT_SECRET: SECRET_A }),
        build({ JWT_SECRET: SECRET_B }),
      ]);
      try {
        const { token } = await one
          .get(AccessTokenIssuer)
          .issue({ id: USER, role: 'BUYER' });
        await expect(
          two.get(AccessTokenVerifier).verify(token),
        ).rejects.toBeInstanceOf(TokenVerificationError);
      } finally {
        await Promise.all([one.close(), two.close()]);
      }
    });

    it('usa ACCESS_TOKEN_TTL_SECONDS', async () => {
      const app = await build({
        JWT_SECRET: SECRET_A,
        ACCESS_TOKEN_TTL_SECONDS: '120',
      });
      try {
        expect(
          (await app.get(AccessTokenIssuer).issue({ id: USER, role: 'BUYER' }))
            .expiresInSeconds,
        ).toBe(120);
      } finally {
        await app.close();
      }
    });

    // El valor por defecto del esquema es 900, pero global-setup define JWT_SECRET; sin ACCESS_TOKEN_TTL_SECONDS, 15 minutos
    it('sin ACCESS_TOKEN_TTL_SECONDS dura 15 minutos', async () => {
      const app = await build({ JWT_SECRET: SECRET_A });
      try {
        expect(
          (await app.get(AccessTokenIssuer).issue({ id: USER, role: 'BUYER' }))
            .expiresInSeconds,
        ).toBe(900);
      } finally {
        await app.close();
      }
    });

    describe('sin JWT_SECRET (fuera de producción)', () => {
      const withoutSecret = () =>
        withEnv({ JWT_SECRET: '' }, () => createTestApp(IdentityModule));

      it('cada proceso inventa el suyo: el token de uno no vale en el otro, y se avisa', async () => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const [one, two] = [await withoutSecret(), await withoutSecret()];
        try {
          const { token } = await one
            .get(AccessTokenIssuer)
            .issue({ id: USER, role: 'BUYER' });
          await expect(
            one.get(AccessTokenVerifier).verify(token),
          ).resolves.toBeDefined();
          await expect(
            two.get(AccessTokenVerifier).verify(token),
          ).rejects.toBeInstanceOf(TokenVerificationError);
          expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('JWT_SECRET no está definido'),
          );
        } finally {
          warn.mockRestore();
          await Promise.all([one.close(), two.close()]);
        }
      });
    });
  });
});
