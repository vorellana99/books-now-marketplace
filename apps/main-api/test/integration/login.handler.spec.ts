import { Module, type INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { LoginCommand } from '../../src/contexts/identity/application/use-cases/session/login.command.js';
import { RegisterUserCommand } from '../../src/contexts/identity/application/use-cases/user/register-user.command.js';
import { SessionService } from '../../src/contexts/identity/application/services/session.service.js';
import { UserRepository } from '../../src/contexts/identity/domain/ports/user.repository.js';
import { LoginHandler } from '../../src/contexts/identity/application/use-cases/session/login.handler.js';
import { PasswordHasher } from '../../src/contexts/identity/domain/ports/password-hasher.port.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AccessTokenVerifier } from '../../src/platform/auth/access-token-verifier.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import {
  AuthenticationError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { UserRegisteredProbe } from '../support/outbox-probes.js';

@Module({ providers: [UserRegisteredProbe] })
class Probes {}

const PASSWORD = 'una contraseña larga y buena';

describe('LoginHandler (PostgreSQL real, por el CommandBus)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let hasher: PasswordHasher;
  let verifier: AccessTokenVerifier;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, IdentityModule, Probes);
    commandBus = app.get(CommandBus);
    hasher = app.get(PasswordHasher);
    verifier = app.get(AccessTokenVerifier);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const register = (email = 'ana@example.com', password = PASSWORD) =>
    commandBus.execute(new RegisterUserCommand(email, password));
  const login = (email = 'ana@example.com', password = PASSWORD) =>
    commandBus.execute(new LoginCommand(email, password));
  const failure = (email?: string, password?: string) =>
    login(email, password).then(
      () => undefined,
      (e: unknown) => e as AuthenticationError,
    );

  describe('con las credenciales correctas', () => {
    it('devuelve un token de acceso que el verificador acepta, con el id y el rol del usuario', async () => {
      const registered = await register();

      const result = await login();

      expect(await verifier.verify(result.accessToken)).toEqual({
        userId: registered.id,
        role: 'BUYER',
      });
      expect(result.expiresInSeconds).toBe(900);
      expect(result.user).toEqual({
        id: registered.id,
        email: 'ana@example.com',
        role: 'BUYER',
      });
    });

    it('el correo no distingue mayúsculas ni espacios de los lados', async () => {
      const registered = await register('ana@example.com');
      for (const email of ['ANA@example.com', ' ana@example.com ']) {
        expect((await login(email)).user.id).toBe(registered.id);
      }
    });

    it('la contraseña distingue mayúsculas y conserva sus espacios', async () => {
      await register('ana@example.com', ` ${PASSWORD} `);
      expect((await failure('ana@example.com', PASSWORD))?.code).toBe(
        'INVALID_CREDENTIALS',
      );
      expect(
        (await failure('ana@example.com', ` ${PASSWORD.toUpperCase()} `))?.code,
      ).toBe('INVALID_CREDENTIALS');
      await expect(
        login('ana@example.com', ` ${PASSWORD} `),
      ).resolves.toBeDefined();
    });

    it('un administrador recibe un token con el rol ADMIN', async () => {
      const registered = await register();
      await query(
        "UPDATE identity.users SET role = 'ADMIN' WHERE id = $1::uuid",
        [registered.id],
      );

      const result = await login();

      expect((await verifier.verify(result.accessToken)).role).toBe('ADMIN');
      expect(result.user.role).toBe('ADMIN');
    });

    it('no devuelve el hash ni la contraseña, y cada inicio emite un token distinto', async () => {
      await register();
      const [a, b] = [await login(), await login()];

      expect(JSON.stringify(a)).not.toContain('scrypt');
      expect(JSON.stringify(a)).not.toContain(PASSWORD);
      expect(a.accessToken).not.toBe(b.accessToken);
    });

    it('el token no lleva el correo', async () => {
      await register();
      const { accessToken } = await login();
      const payload = Buffer.from(
        accessToken.split('.')[1],
        'base64url',
      ).toString();
      expect(payload).not.toContain('ana@example.com');
    });

    it('iniciar sesión no cambia al usuario ni escribe en el outbox', async () => {
      await register();
      const before = await query('SELECT * FROM identity.users');
      const events = await query('SELECT id FROM messaging.outbox');

      await login();

      expect(await query('SELECT * FROM identity.users')).toEqual(before);
      expect(await query('SELECT id FROM messaging.outbox')).toEqual(events);
    });
  });

  describe('con credenciales incorrectas', () => {
    it('la contraseña equivocada, el correo desconocido y el correo mal escrito dan el mismo error', async () => {
      await register();

      const wrongPassword = await failure(
        'ana@example.com',
        'otra contraseña buena',
      );
      const unknownEmail = await failure('nadie@example.com');
      const malformedEmail = await failure('esto no es un correo');

      for (const error of [wrongPassword, unknownEmail, malformedEmail]) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect(error).toBeInstanceOf(DomainError);
        expect(error?.code).toBe('INVALID_CREDENTIALS');
      }
      expect(unknownEmail?.message).toBe(wrongPassword?.message);
      expect(malformedEmail?.message).toBe(wrongPassword?.message);
    });

    it('el mensaje no repite el correo ni la contraseña', async () => {
      await register();
      const error = await failure('ana@example.com', 'otra contraseña buena');
      expect(error?.message).not.toContain('ana@example.com');
      expect(error?.message).not.toContain('otra contraseña buena');
    });

    it.each([undefined, null, 42, {}])(
      'lo que no es texto (%j) también da INVALID_CREDENTIALS',
      async (value) => {
        await register();
        const raw = (email: unknown, password: unknown) =>
          commandBus
            .execute(new LoginCommand(email as string, password as string))
            .then(
              () => undefined,
              (e: unknown) => e as AuthenticationError,
            );
        expect((await raw(value, PASSWORD))?.code).toBe('INVALID_CREDENTIALS');
        expect((await raw('ana@example.com', value))?.code).toBe(
          'INVALID_CREDENTIALS',
        );
      },
    );

    it('una contraseña vacía o de otro largo no se acepta', async () => {
      await register();
      for (const password of ['', ' ', PASSWORD.slice(0, -1), `${PASSWORD}x`]) {
        expect((await failure('ana@example.com', password))?.code).toBe(
          'INVALID_CREDENTIALS',
        );
      }
    });

    it('un hash guardado ilegible no rompe el inicio: es INVALID_CREDENTIALS', async () => {
      const registered = await register();
      await query(
        'UPDATE identity.users SET password_hash = $1 WHERE id = $2::uuid',
        ['esto-no-es-un-hash', registered.id],
      );
      expect((await failure())?.code).toBe('INVALID_CREDENTIALS');
    });

    describe('sin revelar qué correos existen (se hace el mismo trabajo)', () => {
      const verifySpy = () => vi.spyOn(hasher, 'verify');

      it('un correo desconocido también calcula un hash, con el mismo costo que los reales', async () => {
        const spy = verifySpy();
        try {
          await failure('nadie@example.com');
          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy.mock.calls[0][0]).toBe(PASSWORD);
          expect(spy.mock.calls[0][1]).toMatch(/^scrypt\$4\$8\$3\$/);
        } finally {
          spy.mockRestore();
        }
      });

      it('un correo mal escrito también calcula un hash', async () => {
        const spy = verifySpy();
        try {
          await failure('esto no es un correo');
          expect(spy).toHaveBeenCalledTimes(1);
        } finally {
          spy.mockRestore();
        }
      });

      it('un correo conocido con la contraseña equivocada calcula uno solo', async () => {
        await register();
        const spy = verifySpy();
        try {
          await failure('ana@example.com', 'otra contraseña buena');
          expect(spy).toHaveBeenCalledTimes(1);
        } finally {
          spy.mockRestore();
        }
      });

      it('el hash de relleno no es el de ningún usuario y se calcula una sola vez', async () => {
        const registered = await register();
        const hash = vi.spyOn(hasher, 'hash');
        const verify = verifySpy();
        try {
          await failure('nadie@example.com');
          await failure('otro@example.com');
          await failure('tercero@example.com');

          const used = verify.mock.calls.map((c) => c[1]);
          expect(new Set(used).size).toBe(1);
          const [row] = await query<{ password_hash: string }>(
            'SELECT password_hash FROM identity.users WHERE id = $1::uuid',
            [registered.id],
          );
          expect(used[0]).not.toBe(row.password_hash);
          expect(hash.mock.calls.length).toBeLessThanOrEqual(1);
        } finally {
          hash.mockRestore();
          verify.mockRestore();
        }
      });

      it('aunque la verificación del hash de relleno diera true, un correo desconocido no entra', async () => {
        const spy = verifySpy().mockResolvedValue(true);
        try {
          expect((await failure('nadie@example.com'))?.code).toBe(
            'INVALID_CREDENTIALS',
          );
        } finally {
          spy.mockRestore();
        }
      });

      it('si calcular el hash de relleno falla, el siguiente intento lo calcula de nuevo', async () => {
        // Un manejador nuevo: el de la aplicación ya tiene su hash de relleno guardado de otros tests
        const fresh = new LoginHandler(
          app.get(UserRepository),
          hasher,
          app.get(SessionService),
        );
        const attempt = () =>
          fresh.execute(new LoginCommand('nadie@example.com', PASSWORD)).then(
            () => undefined,
            (e: unknown) => e,
          );
        const hash = vi
          .spyOn(hasher, 'hash')
          .mockRejectedValueOnce(new Error('sin memoria'));
        try {
          const first = await attempt();
          expect(first).toBeInstanceOf(Error);
          expect(first).not.toBeInstanceOf(AuthenticationError);
          expect(((await attempt()) as AuthenticationError).code).toBe(
            'INVALID_CREDENTIALS',
          );
        } finally {
          hash.mockRestore();
        }
      });

      it('no acepta ninguna contraseña contra el hash de relleno', async () => {
        const spy = verifySpy();
        try {
          for (const password of [PASSWORD, '', 'password123456']) {
            expect((await failure('nadie@example.com', password))?.code).toBe(
              'INVALID_CREDENTIALS',
            );
          }
          const dummy = spy.mock.calls[0][1];
          expect(await hasher.verify(PASSWORD, dummy)).toBe(false);
        } finally {
          spy.mockRestore();
        }
      });
    });
  });
});
