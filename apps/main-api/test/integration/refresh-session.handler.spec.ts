import { createHash } from 'node:crypto';
import { Logger, Module, type INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { LoginCommand } from '../../src/contexts/identity/application/use-cases/session/login.command.js';
import { LogoutCommand } from '../../src/contexts/identity/application/use-cases/session/logout.command.js';
import { RefreshSessionCommand } from '../../src/contexts/identity/application/use-cases/session/refresh-session.command.js';
import { RegisterUserCommand } from '../../src/contexts/identity/application/use-cases/user/register-user.command.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AccessTokenIssuer } from '../../src/contexts/identity/domain/ports/access-token-issuer.port.js';
import { AccessTokenVerifier } from '../../src/platform/auth/access-token-verifier.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { AuthenticationError } from '../../src/shared-kernel/domain.errors.js';
import {
  failRefreshTokenInserts,
  query,
  resetDatabase,
  slowDownRefreshTokenUpdates,
} from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { UserRegisteredProbe } from '../support/outbox-probes.js';

@Module({ providers: [UserRegisteredProbe] })
class Probes {}

const PASSWORD = 'una contraseña larga y buena';
const TTL_DAYS = 14;
const sha256 = (text: string) =>
  createHash('sha256').update(text).digest('hex');

interface TokenRow {
  id: string;
  user_id: string;
  family_id: string;
  token_hash: string;
  created_at: Date;
  expires_at: Date;
  used_at: Date | null;
  revoked_at: Date | null;
}

describe('Sesiones: login, refresh y logout (PostgreSQL real, por el CommandBus)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let verifier: AccessTokenVerifier;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, IdentityModule, Probes);
    commandBus = app.get(CommandBus);
    verifier = app.get(AccessTokenVerifier);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const register = (email = 'ana@example.com') =>
    commandBus.execute(new RegisterUserCommand(email, PASSWORD));
  const login = (email = 'ana@example.com') =>
    commandBus.execute(new LoginCommand(email, PASSWORD));
  const refresh = (token: unknown) =>
    commandBus.execute(new RefreshSessionCommand(token as string));
  const logout = (token: unknown) =>
    commandBus.execute(new LogoutCommand(token as string));
  const failure = (token: unknown) =>
    refresh(token).then(
      () => undefined,
      (e: unknown) => e as AuthenticationError,
    );
  const rows = () =>
    query<TokenRow>(
      'SELECT * FROM identity.refresh_tokens ORDER BY created_at, id',
    );
  const rowOf = async (token: string) =>
    (
      await query<TokenRow>(
        'SELECT * FROM identity.refresh_tokens WHERE token_hash = $1',
        [sha256(token)],
      )
    )[0];
  // Congela solo la fecha (los temporizadores siguen): los vencimientos salen exactos, sin comparar contra el reloj
  const freezeClock = () => {
    const now = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    return now;
  };
  afterEach(() => {
    vi.useRealTimers();
  });
  const expectInvalid = (error: unknown) => {
    expect(error).toBeInstanceOf(AuthenticationError);
    expect((error as AuthenticationError).code).toBe('INVALID_REFRESH_TOKEN');
  };

  describe('el login entrega el token de refresco', () => {
    it('devuelve un token opaco y guarda solo su hash, con su familia y su vencimiento', async () => {
      await register();
      const now = freezeClock();
      const session = await login();
      vi.useRealTimers();

      expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const stored = await rows();
      expect(stored).toHaveLength(1);
      expect(stored[0].token_hash).toBe(sha256(session.refreshToken));
      expect(stored[0].user_id).toBe(session.user.id);
      expect(stored[0].used_at).toBeNull();
      expect(stored[0].revoked_at).toBeNull();
      expect(stored[0].expires_at.getTime()).toBe(now + TTL_DAYS * 86_400_000);
      expect(JSON.stringify(stored)).not.toContain(session.refreshToken);
    });

    it('cada inicio de sesión abre una familia distinta, con un token distinto', async () => {
      await register();
      const [a, b] = [await login(), await login()];

      expect(a.refreshToken).not.toBe(b.refreshToken);
      const [first, second] = await rows();
      expect(first.family_id).not.toBe(second.family_id);
    });

    it('un inicio de sesión fallido no guarda ningún token', async () => {
      await register();
      await commandBus
        .execute(new LoginCommand('ana@example.com', 'otra contraseña buena'))
        .catch(() => undefined);
      expect(await rows()).toEqual([]);
    });
  });

  describe('refrescar', () => {
    it('entrega un token de acceso nuevo, válido para el mismo usuario, y un token de refresco nuevo', async () => {
      await register();
      const first = await login();

      const second = await refresh(first.refreshToken);

      expect(await verifier.verify(second.accessToken)).toEqual({
        userId: first.user.id,
        role: 'BUYER',
      });
      expect(second.accessToken).not.toBe(first.accessToken);
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.expiresInSeconds).toBe(900);
      expect(second.user).toEqual(first.user);
    });

    it('marca el token usado y deja el nuevo en la misma familia, sin usar', async () => {
      await register();
      const first = await login();
      const now = freezeClock();

      const second = await refresh(first.refreshToken);
      vi.useRealTimers();

      const [oldRow, newRow] = [
        await rowOf(first.refreshToken),
        await rowOf(second.refreshToken),
      ];
      expect(oldRow.used_at?.getTime()).toBe(now);
      expect(oldRow.revoked_at).toBeNull();
      expect(newRow.used_at).toBeNull();
      expect(newRow.revoked_at).toBeNull();
      expect(newRow.family_id).toBe(oldRow.family_id);
      expect(newRow.user_id).toBe(oldRow.user_id);
      expect(newRow.expires_at.getTime()).toBe(now + TTL_DAYS * 86_400_000);
    });

    it('se puede encadenar: cada token nuevo se refresca a su vez', async () => {
      await register();
      let session = await login();
      const seen = new Set([session.refreshToken]);
      for (let i = 0; i < 4; i += 1) {
        session = await refresh(session.refreshToken);
        expect(seen.has(session.refreshToken)).toBe(false);
        seen.add(session.refreshToken);
      }
      const stored = await rows();
      expect(stored).toHaveLength(5);
      expect(new Set(stored.map((r) => r.family_id)).size).toBe(1);
      expect(stored.filter((r) => r.used_at === null)).toHaveLength(1);
    });

    it('toma el rol actual del usuario: un cambio de rol vale desde el siguiente refresco', async () => {
      const registered = await register();
      const first = await login();
      await query(
        "UPDATE identity.users SET role = 'ADMIN' WHERE id = $1::uuid",
        [registered.id],
      );

      const second = await refresh(first.refreshToken);

      expect((await verifier.verify(second.accessToken)).role).toBe('ADMIN');
      expect(second.user.role).toBe('ADMIN');
    });

    it('no escribe nada en el outbox ni cambia al usuario', async () => {
      await register();
      const before = await query('SELECT * FROM identity.users');
      const events = await query('SELECT id FROM messaging.outbox');
      await refresh((await login()).refreshToken);
      expect(await query('SELECT * FROM identity.users')).toEqual(before);
      expect(await query('SELECT id FROM messaging.outbox')).toEqual(events);
    });

    it('una sesión no afecta a las de otras familias ni a las de otros usuarios', async () => {
      await register('ana@example.com');
      await register('luis@example.com');
      const [anaPhone, anaLaptop, luis] = [
        await login('ana@example.com'),
        await login('ana@example.com'),
        await login('luis@example.com'),
      ];

      await refresh(anaPhone.refreshToken);

      await expect(refresh(anaLaptop.refreshToken)).resolves.toBeDefined();
      await expect(refresh(luis.refreshToken)).resolves.toBeDefined();
    });
  });

  describe('un token que no sirve', () => {
    it.each([
      ['desconocido', 'a'.repeat(43)],
      ['vacío', ''],
      ['corto', 'abc'],
      ['con caracteres que no valen', `${'a'.repeat(42)}+`],
      ['de más de 43 caracteres', 'a'.repeat(200)],
      [undefined, undefined],
      ['nulo', null],
      ['un número', 42],
      ['un objeto', {}],
    ])('%s da INVALID_REFRESH_TOKEN y no cambia nada', async (_why, token) => {
      await register();
      await login();
      const before = await rows();

      expectInvalid(await failure(token));

      expect(await rows()).toEqual(before);
    });

    it('el mensaje es siempre el mismo y no repite el token', async () => {
      await register();
      const session = await login();
      await refresh(session.refreshToken);
      const messages = new Set<string>();
      for (const token of [
        'a'.repeat(43),
        'malo',
        session.refreshToken, // ya usado
      ]) {
        const error = await failure(token);
        messages.add(error!.message);
        expect(error!.message).not.toContain(token);
      }
      expect(messages.size).toBe(1);
    });

    it('uno vencido da INVALID_REFRESH_TOKEN, no se rota y no se toca su familia', async () => {
      await register();
      const session = await login();
      const other = await refresh(session.refreshToken);
      await query(
        "UPDATE identity.refresh_tokens SET created_at = now() - interval '3 days', expires_at = now() - interval '1 second' WHERE token_hash = $1",
        [sha256(other.refreshToken)],
      );
      const before = await rows();

      expectInvalid(await failure(other.refreshToken));

      expect(await rows()).toEqual(before);
    });

    it('uno que vence en el futuro todavía sirve', async () => {
      await register();
      const session = await login();
      await query(
        "UPDATE identity.refresh_tokens SET expires_at = now() + interval '1 minute'",
      );
      await expect(refresh(session.refreshToken)).resolves.toBeDefined();
    });

    it('el de un usuario borrado ya no existe', async () => {
      const registered = await register();
      const session = await login();
      await query('DELETE FROM identity.users WHERE id = $1::uuid', [
        registered.id,
      ]);
      expectInvalid(await failure(session.refreshToken));
    });
  });

  describe('reutilizar un token ya usado (señal de robo)', () => {
    it('da INVALID_REFRESH_TOKEN y revoca la familia entera, incluido el token nuevo que no se usó', async () => {
      await register();
      const first = await login();
      const second = await refresh(first.refreshToken);

      expectInvalid(await failure(first.refreshToken));

      expectInvalid(await failure(second.refreshToken));
      const stored = await rows();
      expect(stored).toHaveLength(2);
      expect(stored.every((r) => r.revoked_at !== null)).toBe(true);
    });

    it('la revocación se confirma aunque la operación falle (no se deshace con el error)', async () => {
      await register();
      const first = await login();
      await refresh(first.refreshToken);

      expectInvalid(await failure(first.refreshToken));

      expect(
        (await rows()).filter((r) => r.revoked_at !== null).length,
      ).toBeGreaterThan(0);
    });

    it('no toca otras sesiones del mismo usuario ni de otros', async () => {
      await register('ana@example.com');
      await register('luis@example.com');
      const [stolen, anaOther, luis] = [
        await login('ana@example.com'),
        await login('ana@example.com'),
        await login('luis@example.com'),
      ];
      await refresh(stolen.refreshToken);

      expectInvalid(await failure(stolen.refreshToken));

      await expect(refresh(anaOther.refreshToken)).resolves.toBeDefined();
      await expect(refresh(luis.refreshToken)).resolves.toBeDefined();
    });

    it('queda un aviso con el usuario y la sesión, sin el token', async () => {
      await register();
      const first = await login();
      const second = await refresh(first.refreshToken);
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        await failure(first.refreshToken);

        expect(warn).toHaveBeenCalledTimes(1);
        const text = JSON.stringify(warn.mock.calls);
        expect(text).toContain(first.user.id);
        expect(text).toContain((await rowOf(second.refreshToken)).family_id);
        for (const token of [first.refreshToken, second.refreshToken]) {
          expect(text).not.toContain(token);
          expect(text).not.toContain(sha256(token));
        }
      } finally {
        warn.mockRestore();
      }
    });

    it('un token desconocido, malformado o vencido no genera ese aviso', async () => {
      await register();
      await login();
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        await failure('a'.repeat(43));
        await failure('malo');
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('un token revocado (por logout) no es una reutilización: no avisa ni cambia nada más', async () => {
      await register();
      const session = await login();
      await logout(session.refreshToken);
      const before = await rows();
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        expectInvalid(await failure(session.refreshToken));
        expect(warn).not.toHaveBeenCalled();
        expect(await rows()).toEqual(before);
      } finally {
        warn.mockRestore();
      }
    });
  });

  describe('usos simultáneos del mismo token', () => {
    it('solo uno entra; los demás reciben INVALID_REFRESH_TOKEN y la familia queda revocada', async () => {
      await register();
      const session = await login();

      // Cada actualización de un token tarda 150 ms: sin el bloqueo de la fila, las demás renovaciones leerían el token
      // todavía sin usar mientras la primera lo marca, y varias entrarían
      const restore = await slowDownRefreshTokenUpdates(150);
      let results: PromiseSettledResult<{ refreshToken: string }>[];
      try {
        results = await Promise.allSettled(
          Array.from({ length: 6 }, () => refresh(session.refreshToken)),
        );
      } finally {
        await restore();
      }

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(ok).toHaveLength(1);
      expect(failed).toHaveLength(5);
      for (const f of failed) expectInvalid(f.reason);
      const stored = await rows();
      expect(stored).toHaveLength(2); // el original y el único que se entregó
      expect(stored.every((r) => r.revoked_at !== null)).toBe(true);
      const winner = (ok[0] as PromiseFulfilledResult<{ refreshToken: string }>)
        .value;
      expectInvalid(await failure(winner.refreshToken));
    });
  });

  describe('atomicidad', () => {
    it('si no se puede emitir el token de acceso, el viejo no queda usado', async () => {
      await register();
      const session = await login();
      const spy = vi
        .spyOn(app.get(AccessTokenIssuer), 'issue')
        .mockRejectedValueOnce(new Error('falló al emitir el token'));

      await expect(refresh(session.refreshToken)).rejects.toThrow(
        'falló al emitir el token',
      );

      spy.mockRestore();
      expect((await rowOf(session.refreshToken)).used_at).toBeNull();
      expect(await rows()).toHaveLength(1);
      await expect(refresh(session.refreshToken)).resolves.toBeDefined();
    });

    it('si la base rechaza guardar el token nuevo, tampoco queda el viejo usado', async () => {
      await register();
      const session = await login();
      const restore = await failRefreshTokenInserts();
      try {
        await expect(refresh(session.refreshToken)).rejects.toThrow(
          /falló el guardado del token nuevo/,
        );
      } finally {
        await restore();
      }

      expect(await rows()).toHaveLength(1);
      expect((await rowOf(session.refreshToken)).used_at).toBeNull();
      await expect(refresh(session.refreshToken)).resolves.toBeDefined();
    });
  });

  describe('cerrar sesión', () => {
    it('revoca la familia entera: ni el token ni sus sucesores sirven ya', async () => {
      await register();
      const first = await login();
      const second = await refresh(first.refreshToken);

      await expect(logout(second.refreshToken)).resolves.toBeUndefined();

      expectInvalid(await failure(second.refreshToken));
      expectInvalid(await failure(first.refreshToken));
      expect((await rows()).every((r) => r.revoked_at !== null)).toBe(true);
    });

    it('con un token ya usado también cierra la sesión', async () => {
      await register();
      const first = await login();
      const second = await refresh(first.refreshToken);

      await logout(first.refreshToken);

      expectInvalid(await failure(second.refreshToken));
    });

    it('no toca las otras sesiones del usuario (otros dispositivos) ni las de otros', async () => {
      await register('ana@example.com');
      await register('luis@example.com');
      const [phone, laptop, luis] = [
        await login('ana@example.com'),
        await login('ana@example.com'),
        await login('luis@example.com'),
      ];

      await logout(phone.refreshToken);

      expectInvalid(await failure(phone.refreshToken));
      await expect(refresh(laptop.refreshToken)).resolves.toBeDefined();
      await expect(refresh(luis.refreshToken)).resolves.toBeDefined();
    });

    it('repetirlo, o con un token desconocido o malformado, no falla ni revela nada', async () => {
      await register();
      const session = await login();

      await logout(session.refreshToken);
      for (const token of [
        session.refreshToken,
        'a'.repeat(43),
        '',
        'malo',
        undefined,
        null,
        42,
      ]) {
        await expect(logout(token)).resolves.toBeUndefined();
      }
    });

    it('conserva el primer momento de revocación al repetirlo', async () => {
      await register();
      const session = await login();
      await logout(session.refreshToken);
      const [first] = await rows();

      await logout(session.refreshToken);

      expect((await rows())[0].revoked_at).toEqual(first.revoked_at);
    });

    it('no invalida el token de acceso ya emitido (vive hasta que vence)', async () => {
      await register();
      const session = await login();
      await logout(session.refreshToken);
      await expect(verifier.verify(session.accessToken)).resolves.toBeDefined();
    });
  });
});
