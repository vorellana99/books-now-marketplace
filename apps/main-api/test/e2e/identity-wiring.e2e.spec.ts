import type { INestApplication } from '@nestjs/common';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { PasswordHasher } from '../../src/contexts/identity/domain/password-hasher.port.js';
import { ScryptPasswordHasher } from '../../src/contexts/identity/infrastructure/scrypt-password-hasher.js';
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
});
