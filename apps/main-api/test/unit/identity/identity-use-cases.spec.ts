import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginCommand } from '../../../src/contexts/identity/application/use-cases/session/login.command.js';
import { LoginHandler } from '../../../src/contexts/identity/application/use-cases/session/login.handler.js';
import { LogoutCommand } from '../../../src/contexts/identity/application/use-cases/session/logout.command.js';
import { LogoutHandler } from '../../../src/contexts/identity/application/use-cases/session/logout.handler.js';
import { RefreshSessionCommand } from '../../../src/contexts/identity/application/use-cases/session/refresh-session.command.js';
import { RefreshSessionHandler } from '../../../src/contexts/identity/application/use-cases/session/refresh-session.handler.js';
import { RegisterUserCommand } from '../../../src/contexts/identity/application/use-cases/user/register-user.command.js';
import { RegisterUserHandler } from '../../../src/contexts/identity/application/use-cases/user/register-user.handler.js';
import { SessionService } from '../../../src/contexts/identity/application/services/session.service.js';
import { hashRefreshToken } from '../../../src/contexts/identity/domain/model/session/refresh-token.js';
import {
  AuthenticationError,
  ConflictError,
  DomainError,
} from '../../../src/shared-kernel/domain.errors.js';
import {
  FakeAccessTokenIssuer,
  FakeHasher,
} from '../../fakes/identity-fakes.js';
import { InMemorySessionRepository } from '../../fakes/in-memory-session-repository.js';
import { InMemoryUserRepository } from '../../fakes/in-memory-user-repository.js';

const PASSWORD = 'una contraseña larga y buena';

function setup() {
  const users = new InMemoryUserRepository();
  const sessions = new InMemorySessionRepository();
  const hasher = new FakeHasher();
  const issuer = new FakeAccessTokenIssuer();
  const config = new ConfigService({ REFRESH_TOKEN_TTL_DAYS: 14 });
  const service = new SessionService(sessions, issuer, config);
  return {
    users,
    sessions,
    hasher,
    issuer,
    register: new RegisterUserHandler(users, hasher),
    login: new LoginHandler(users, hasher, service),
    refresh: new RefreshSessionHandler(sessions, users, service),
    logout: new LogoutHandler(sessions),
  };
}
type World = ReturnType<typeof setup>;

const signUp = (w: World, email = 'ana@example.com') =>
  w.register.execute(new RegisterUserCommand(email, PASSWORD));
const signIn = (w: World, email = 'ana@example.com', password = PASSWORD) =>
  w.login.execute(new LoginCommand(email, password));
const refreshWith = (w: World, token: unknown) =>
  w.refresh.execute(new RefreshSessionCommand(token as string));
const code = async (promise: Promise<unknown>) =>
  ((await promise.catch((e: unknown) => e)) as DomainError).code;

describe('RegisterUserHandler', () => {
  it('registra a un comprador: guarda al usuario con el hash y publica su evento', async () => {
    const w = setup();

    const registered = await signUp(w);

    expect(registered).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email: 'ana@example.com',
      role: 'BUYER',
    });
    const saved = await w.users.findById(registered.id);
    expect(saved?.passwordHash).toBe(`fake$${PASSWORD}`);
    expect(saved?.passwordHash).not.toBe(PASSWORD);
    expect(w.users.published().map((e) => e.eventName)).toEqual([
      'identity.user.registered',
    ]);
  });

  it('normaliza el correo (recortado y en minúsculas)', async () => {
    const w = setup();

    const registered = await signUp(w, '  Ana@Example.COM ');

    expect(registered.email).toBe('ana@example.com');
  });

  it('un correo inválido es INVALID_EMAIL y no calcula ningún hash ni guarda nada', async () => {
    const w = setup();

    expect(await code(signUp(w, 'no-es-un-correo'))).toBe('INVALID_EMAIL');
    expect(w.hasher.hashed).toEqual([]);
    expect(w.users.count()).toBe(0);
  });

  it('una contraseña débil es WEAK_PASSWORD, antes de gastar el hash lento', async () => {
    const w = setup();

    const result = await code(
      w.register.execute(new RegisterUserCommand('ana@example.com', 'corta')),
    );

    expect(result).toBe('WEAK_PASSWORD');
    expect(w.hasher.hashed).toEqual([]);
  });

  it('un correo que ya tiene cuenta es ConflictError EMAIL_ALREADY_REGISTERED', async () => {
    const w = setup();
    await signUp(w);

    const error = await signUp(w).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(w.users.count()).toBe(1);
  });

  it('no devuelve la contraseña ni su hash', async () => {
    const w = setup();

    const registered = await signUp(w);

    expect(JSON.stringify(registered)).not.toContain(PASSWORD);
    expect(JSON.stringify(registered)).not.toContain('fake$');
  });
});

describe('LoginHandler', () => {
  it('con las credenciales correctas abre una sesión: token de acceso, token de refresco y el usuario', async () => {
    const w = setup();
    const user = await signUp(w);

    const session = await signIn(w);

    expect(session.accessToken).toBe(`access:${user.id}:BUYER`);
    expect(session.expiresInSeconds).toBe(900);
    expect(session.user).toEqual(user);
    expect(session.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // en el almacén queda solo el hash
    const stored = w.sessions.rows();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.hash).toBe(hashRefreshToken(session.refreshToken));
    expect(JSON.stringify(stored)).not.toContain(session.refreshToken);
  });

  it('cada inicio de sesión abre una familia distinta', async () => {
    const w = setup();
    await signUp(w);

    await signIn(w);
    await signIn(w);

    expect(new Set(w.sessions.rows().map((r) => r.familyId)).size).toBe(2);
  });

  it('el token de refresco vence a los días de REFRESH_TOKEN_TTL_DAYS', async () => {
    const w = setup();
    await signUp(w);
    const before = Date.now();

    await signIn(w);

    const [row] = w.sessions.rows();
    const ttl = (row?.expiresAt.getTime() ?? 0) - before;
    expect(ttl).toBeGreaterThanOrEqual(14 * 86_400_000 - 1000);
    expect(ttl).toBeLessThanOrEqual(14 * 86_400_000 + 5000);
  });

  describe('credenciales que no valen: siempre INVALID_CREDENTIALS, y sin sesión', () => {
    it.each([
      ['una contraseña equivocada', 'ana@example.com', 'otra contraseña buena'],
      ['un correo desconocido', 'nadie@example.com', PASSWORD],
      ['un correo mal escrito', 'esto no es un correo', PASSWORD],
    ])('%s', async (_name, email, password) => {
      const w = setup();
      await signUp(w);

      const error = await signIn(w, email, password).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as AuthenticationError).code).toBe('INVALID_CREDENTIALS');
      expect(w.sessions.rows()).toEqual([]);
    });

    it('el mensaje es el mismo en los tres casos: no revela qué correos tienen cuenta', async () => {
      const w = setup();
      await signUp(w);

      const messages = await Promise.all(
        [
          signIn(w, 'ana@example.com', 'otra contraseña buena'),
          signIn(w, 'nadie@example.com'),
          signIn(w, 'esto no es un correo'),
        ].map((p) => p.catch((e: Error) => e.message)),
      );

      expect(new Set(messages).size).toBe(1);
    });
  });

  describe('tiempo constante: un correo desconocido también cuesta una verificación de hash', () => {
    it('con un correo desconocido o mal escrito se verifica contra un hash de relleno', async () => {
      const w = setup();
      await signUp(w);
      w.hasher.verified.length = 0;

      await signIn(w, 'nadie@example.com').catch(() => undefined);
      await signIn(w, 'esto no es un correo').catch(() => undefined);

      expect(w.hasher.verified).toHaveLength(2);
    });

    it('el hash de relleno se calcula una vez y se reutiliza', async () => {
      const w = setup();
      w.hasher.hashed.length = 0;

      await signIn(w, 'a@example.com').catch(() => undefined);
      await signIn(w, 'b@example.com').catch(() => undefined);
      await signIn(w, 'c@example.com').catch(() => undefined);

      expect(w.hasher.hashed).toHaveLength(1);
    });

    it('aunque la verificación del hash de relleno diera true, un correo desconocido no entra', async () => {
      const w = setup();
      vi.spyOn(w.hasher, 'verify').mockResolvedValue(true);

      expect(await code(signIn(w, 'nadie@example.com'))).toBe(
        'INVALID_CREDENTIALS',
      );
    });

    it('si calcular el hash de relleno falla, el siguiente intento lo calcula de nuevo', async () => {
      const w = setup();
      vi.spyOn(w.hasher, 'hash').mockRejectedValueOnce(
        new Error('sin memoria'),
      );

      const first = await signIn(w, 'nadie@example.com').catch(
        (e: unknown) => e,
      );
      const second = await signIn(w, 'nadie@example.com').catch(
        (e: unknown) => e,
      );

      expect(first).not.toBeInstanceOf(AuthenticationError);
      expect((second as AuthenticationError).code).toBe('INVALID_CREDENTIALS');
    });
  });

  it('si no se puede emitir el token de acceso, no queda ninguna sesión guardada', async () => {
    const w = setup();
    await signUp(w);
    w.issuer.failWith = new Error('no se pudo firmar');

    await expect(signIn(w)).rejects.toThrow('no se pudo firmar');

    expect(w.sessions.rows()).toEqual([]);
  });
});

describe('RefreshSessionHandler', () => {
  it('cambia un token de refresco por una sesión nueva: accesos y refrescos nuevos, el viejo usado', async () => {
    const w = setup();
    const user = await signUp(w);
    const first = await signIn(w);

    const second = await refreshWith(w, first.refreshToken);

    expect(second.accessToken).toBe(`access:${user.id}:BUYER`);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user).toEqual(user);
    const rows = w.sessions.rows();
    expect(rows).toHaveLength(2);
    const old = rows.find(
      (r) => r.hash === hashRefreshToken(first.refreshToken),
    );
    expect(old?.usedAt).not.toBeNull();
    expect(rows.find((r) => r.id !== old?.id)).toMatchObject({
      familyId: old?.familyId,
      usedAt: null,
      revokedAt: null,
    });
  });

  it('se puede encadenar: cada token nuevo se refresca a su vez', async () => {
    const w = setup();
    await signUp(w);
    let session = await signIn(w);

    for (let i = 0; i < 3; i++)
      session = await refreshWith(w, session.refreshToken);

    expect(w.sessions.rows()).toHaveLength(4);
  });

  it('toma el rol actual del usuario: un cambio de rol vale desde el siguiente refresco', async () => {
    const w = setup();
    const user = await signUp(w);
    const session = await signIn(w);
    w.users.setRole(user.id, 'ADMIN');

    const renewed = await refreshWith(w, session.refreshToken);

    expect(renewed.accessToken).toBe(`access:${user.id}:ADMIN`);
    expect(renewed.user.role).toBe('ADMIN');
  });

  describe('un token que no sirve: siempre INVALID_REFRESH_TOKEN', () => {
    it.each([
      ['uno mal formado', 'esto no es un token'],
      ['uno que no es un texto', 12345],
      ['uno desconocido', 'a'.repeat(43)],
      ['uno vacío', ''],
    ])('%s', async (_name, token) => {
      const w = setup();
      await signUp(w);
      await signIn(w);
      const before = w.sessions.rows();

      const error = await refreshWith(w, token).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AuthenticationError);
      expect((error as AuthenticationError).code).toBe('INVALID_REFRESH_TOKEN');
      expect(w.sessions.rows()).toEqual(before);
    });

    it('un token mal formado ni siquiera llega al almacén', async () => {
      const w = setup();
      const rotate = vi.spyOn(w.sessions, 'rotate');

      await refreshWith(w, 'mal formado').catch(() => undefined);

      expect(rotate).not.toHaveBeenCalled();
    });

    it('uno vencido no se rota y no toca su familia', async () => {
      const w = setup();
      await signUp(w);
      const session = await signIn(w);
      const [row] = w.sessions.rows();
      w.sessions.setDates(row?.id as string, {
        expiresAt: new Date(Date.now() - 1),
      });

      expect(await code(refreshWith(w, session.refreshToken))).toBe(
        'INVALID_REFRESH_TOKEN',
      );
      expect(w.sessions.rows()[0]?.usedAt).toBeNull();
      expect(w.sessions.rows()[0]?.revokedAt).toBeNull();
    });

    it('el mensaje es siempre el mismo y no repite el token', async () => {
      const w = setup();
      await signUp(w);
      const session = await signIn(w);
      await refreshWith(w, session.refreshToken);

      const messages = await Promise.all(
        ['mal formado', 'b'.repeat(43), session.refreshToken].map((t) =>
          refreshWith(w, t).catch((e: Error) => e.message),
        ),
      );

      expect(new Set(messages).size).toBe(1);
      for (const message of messages) {
        expect(message).not.toContain(session.refreshToken);
      }
    });
  });

  describe('reutilizar un token ya usado (señal de robo)', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
    });
    afterEach(() => vi.restoreAllMocks());

    it('da INVALID_REFRESH_TOKEN y revoca la familia entera, incluido el token nuevo que no se usó', async () => {
      const w = setup();
      await signUp(w);
      const first = await signIn(w);
      await refreshWith(w, first.refreshToken);

      expect(await code(refreshWith(w, first.refreshToken))).toBe(
        'INVALID_REFRESH_TOKEN',
      );

      const rows = w.sessions.rows();
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    });

    it('la revocación se queda aunque la operación falle', async () => {
      const w = setup();
      await signUp(w);
      const first = await signIn(w);
      await refreshWith(w, first.refreshToken);

      await refreshWith(w, first.refreshToken).catch(() => undefined);

      expect(w.sessions.rows().some((r) => r.revokedAt !== null)).toBe(true);
    });

    it('no toca otras sesiones del mismo usuario ni de otros', async () => {
      const w = setup();
      await signUp(w);
      await signUp(w, 'luis@example.com');
      const stolen = await signIn(w);
      const other = await signIn(w);
      const stranger = await signIn(w, 'luis@example.com');
      await refreshWith(w, stolen.refreshToken);

      await refreshWith(w, stolen.refreshToken).catch(() => undefined);

      for (const untouched of [other, stranger]) {
        const row = w.sessions
          .rows()
          .find((r) => r.hash === hashRefreshToken(untouched.refreshToken));
        expect(row?.revokedAt).toBeNull();
      }
    });

    it('deja un aviso con el usuario y la sesión, sin el token', async () => {
      const w = setup();
      const user = await signUp(w);
      const first = await signIn(w);
      await refreshWith(w, first.refreshToken);

      await refreshWith(w, first.refreshToken).catch(() => undefined);

      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toContain(user.id);
      expect(line).toContain(w.sessions.rows()[0]?.familyId);
      expect(line).not.toContain(first.refreshToken);
    });

    it('un token desconocido, mal formado o vencido no genera ese aviso', async () => {
      const w = setup();
      await signUp(w);
      await refreshWith(w, 'mal').catch(() => undefined);
      await refreshWith(w, 'c'.repeat(43)).catch(() => undefined);

      expect(warn).not.toHaveBeenCalled();
    });

    it('un token revocado por logout no es una reutilización: no avisa', async () => {
      const w = setup();
      await signUp(w);
      const first = await signIn(w);
      await w.logout.execute(new LogoutCommand(first.refreshToken));

      expect(await code(refreshWith(w, first.refreshToken))).toBe(
        'INVALID_REFRESH_TOKEN',
      );
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('atomicidad', () => {
    it('si no se puede emitir el token de acceso, el viejo no queda usado y no nace uno nuevo', async () => {
      const w = setup();
      await signUp(w);
      const session = await signIn(w);
      w.issuer.failWith = new Error('no se pudo firmar');

      await expect(refreshWith(w, session.refreshToken)).rejects.toThrow(
        'no se pudo firmar',
      );

      expect(w.sessions.rows()).toHaveLength(1);
      expect(w.sessions.rows()[0]?.usedAt).toBeNull();
      w.issuer.failWith = null;
      await expect(refreshWith(w, session.refreshToken)).resolves.toBeDefined();
    });
  });
});

describe('LogoutHandler', () => {
  it('revoca la familia entera: ni el token ni sus sucesores sirven ya', async () => {
    const w = setup();
    await signUp(w);
    const first = await signIn(w);
    const second = await refreshWith(w, first.refreshToken);

    await w.logout.execute(new LogoutCommand(second.refreshToken));

    expect(w.sessions.rows().every((r) => r.revokedAt !== null)).toBe(true);
    expect(await code(refreshWith(w, second.refreshToken))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
  });

  it('también con un token ya usado', async () => {
    const w = setup();
    await signUp(w);
    const first = await signIn(w);
    await refreshWith(w, first.refreshToken);

    await w.logout.execute(new LogoutCommand(first.refreshToken));

    expect(w.sessions.rows().every((r) => r.revokedAt !== null)).toBe(true);
  });

  it('no toca las otras sesiones del usuario (otros dispositivos)', async () => {
    const w = setup();
    await signUp(w);
    const phone = await signIn(w);
    const laptop = await signIn(w);

    await w.logout.execute(new LogoutCommand(phone.refreshToken));

    const row = w.sessions
      .rows()
      .find((r) => r.hash === hashRefreshToken(laptop.refreshToken));
    expect(row?.revokedAt).toBeNull();
  });

  it.each([
    ['desconocido', 'd'.repeat(43)],
    ['mal formado', 'xyz'],
    ['que no es un texto', undefined],
  ])('con un token %s no falla ni revela nada', async (_name, token) => {
    const w = setup();

    await expect(
      w.logout.execute(new LogoutCommand(token as unknown as string)),
    ).resolves.toBeUndefined();
  });

  it('un token mal formado ni siquiera llega al almacén', async () => {
    const w = setup();
    const revoke = vi.spyOn(w.sessions, 'revoke');

    await w.logout.execute(new LogoutCommand('xyz'));

    expect(revoke).not.toHaveBeenCalled();
  });

  it('repetirlo conserva el primer momento de la revocación', async () => {
    const w = setup();
    await signUp(w);
    const first = await signIn(w);

    await w.logout.execute(new LogoutCommand(first.refreshToken));
    const revokedAt = w.sessions.rows()[0]?.revokedAt?.getTime();
    await new Promise((resolve) => setTimeout(resolve, 5));
    await w.logout.execute(new LogoutCommand(first.refreshToken));

    expect(w.sessions.rows()[0]?.revokedAt?.getTime()).toBe(revokedAt);
  });
});
