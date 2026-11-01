import { Module, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { AccessTokenVerifier } from '../../src/platform/auth/access-token-verifier.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';
import { UserRegisteredProbe } from '../support/outbox-probes.js';

@Module({ providers: [UserRegisteredProbe] })
class Probes {}

const EMAIL = 'ana@example.com';
const PASSWORD = 'una contraseña larga y buena';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const countUsers = async () =>
  Number(
    (await query<{ n: string }>('SELECT count(*) AS n FROM identity.users'))[0]
      .n,
  );

describe('/auth (e2e, aplicación y PostgreSQL reales)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const register = (body: unknown = { email: EMAIL, password: PASSWORD }) =>
    http()
      .post('/auth/register')
      .send(body as object);
  const login = (body: unknown = { email: EMAIL, password: PASSWORD }) =>
    http()
      .post('/auth/login')
      .send(body as object);

  beforeAll(async () => {
    app = await createHttpApp([
      OutboxModule,
      IdentityModule,
      AUTH_MODULE,
      Probes,
    ]);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  describe('POST /auth/register', () => {
    it('201 con el id, el correo y el rol, sin contraseña ni hash', async () => {
      const res = await register({
        email: ' Ana@Example.COM ',
        password: PASSWORD,
      }).expect(201);

      expect(res.body).toEqual({
        id: expect.stringMatching(UUID),
        email: EMAIL,
        role: 'BUYER',
      });
      expect(res.text).not.toContain('scrypt');
      expect(res.text).not.toContain(PASSWORD);
      expect(res.headers['x-request-id']).toBeDefined();
    });

    it('la respuesta no se guarda en cachés', async () => {
      const res = await register().expect(201);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('guarda al usuario y su evento con el requestId de la petición', async () => {
      const res = await register().set('X-Request-Id', 'r-http').expect(201);

      expect(await countUsers()).toBe(1);
      const [event] = await outboxRows();
      expect(event).toMatchObject({
        event_name: 'identity.user.registered',
        aggregate_id: res.body.id,
        correlation_id: 'r-http',
      });
    });

    it('400 sin cuerpo', async () => {
      await http().post('/auth/register').expect(400);
      expect(await countUsers()).toBe(0);
    });

    it('el rol no se puede elegir: un campo role (o cualquier otro de más) es 400 y no crea nada', async () => {
      for (const extra of [
        { role: 'ADMIN' },
        { role: 'BUYER' },
        { id: '0196a000-0000-7000-8000-0000000000aa' },
        { passwordHash: 'x' },
      ]) {
        await register({ email: EMAIL, password: PASSWORD, ...extra }).expect(
          400,
        );
      }
      expect(await countUsers()).toBe(0);
    });

    it.each([
      ['con un cuerpo vacío', {}],
      ['sin correo', { password: PASSWORD }],
      ['sin contraseña', { email: EMAIL }],
      ['con el correo vacío', { email: '', password: PASSWORD }],
      ['con la contraseña vacía', { email: EMAIL, password: '' }],
      ['con el correo como número', { email: 42, password: PASSWORD }],
      [
        'con la contraseña como número',
        { email: EMAIL, password: 12345678901 },
      ],
      ['con la contraseña como objeto', { email: EMAIL, password: { a: 1 } }],
      [
        'con un correo de más de 254 caracteres',
        { email: `${'a'.repeat(260)}@x.com`, password: PASSWORD },
      ],
      [
        'con una contraseña de más de 1024 caracteres',
        { email: EMAIL, password: 'x1'.repeat(600) },
      ],
    ])('400 %s', async (_why, body) => {
      const res = await register(body).expect(400);
      expect(res.text).not.toContain(PASSWORD);
      expect(await countUsers()).toBe(0);
    });

    it('409 EMAIL_ALREADY_REGISTERED con un correo repetido, aunque cambien las mayúsculas', async () => {
      await register().expect(201);

      const res = await register({
        email: 'ANA@example.com',
        password: 'otra contraseña buena',
      }).expect(409);

      expect(res.body).toEqual({
        statusCode: 409,
        errorCode: 'EMAIL_ALREADY_REGISTERED',
        message: expect.any(String),
      });
      expect(res.text).not.toContain('otra contraseña buena');
      expect(await countUsers()).toBe(1);
    });

    it('422 INVALID_EMAIL con un correo mal formado', async () => {
      const res = await register({
        email: 'sin-arroba',
        password: PASSWORD,
      }).expect(422);
      expect(res.body.errorCode).toBe('INVALID_EMAIL');
    });

    it.each(['corta', 'password123', 'aaaaaaaaaaaa'])(
      '422 WEAK_PASSWORD con la contraseña %j',
      async (password) => {
        const res = await register({ email: EMAIL, password }).expect(422);
        expect(res.body.errorCode).toBe('WEAK_PASSWORD');
        expect(await countUsers()).toBe(0);
      },
    );

    it('422 WEAK_PASSWORD con una contraseña de 129 caracteres (el máximo es 128)', async () => {
      const res = await register({
        email: EMAIL,
        password: 'x1'.repeat(64) + 'y',
      }).expect(422);
      expect(res.body.errorCode).toBe('WEAK_PASSWORD');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await register().expect(201);
    });

    it('200 con el token de acceso, su duración y el usuario', async () => {
      const res = await login().expect(200);

      expect(res.body).toEqual({
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshToken: expect.stringMatching(/^[\w-]{43}$/),
        user: { id: expect.stringMatching(UUID), email: EMAIL, role: 'BUYER' },
      });
      expect(res.text).not.toContain('scrypt');
      expect(res.text).not.toContain(PASSWORD);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('el token vale para el usuario registrado', async () => {
      const registered = await query<{ id: string }>(
        'SELECT id FROM identity.users',
      );
      const res = await login().expect(200);

      expect(
        await app.get(AccessTokenVerifier).verify(res.body.accessToken),
      ).toEqual({ userId: registered[0].id, role: 'BUYER' });
    });

    it('el correo se acepta con otras mayúsculas', async () => {
      await login({ email: 'ANA@Example.com', password: PASSWORD }).expect(200);
    });

    it('401 con la contraseña equivocada, el correo desconocido o el correo mal escrito: la misma respuesta', async () => {
      const bodies = [];
      for (const body of [
        { email: EMAIL, password: 'otra contraseña buena' },
        { email: 'nadie@example.com', password: PASSWORD },
        { email: 'esto no es un correo', password: PASSWORD },
      ]) {
        bodies.push((await login(body).expect(401)).body);
      }

      expect(bodies[0]).toEqual({
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos',
      });
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
    });

    it('el 401 no repite el correo ni la contraseña', async () => {
      const res = await login({
        email: 'nadie@example.com',
        password: 'otra contraseña buena',
      }).expect(401);
      expect(res.text).not.toContain('nadie@example.com');
      expect(res.text).not.toContain('otra contraseña buena');
    });

    it('400 sin cuerpo', async () => {
      await http().post('/auth/login').expect(400);
    });

    it.each([
      ['con un cuerpo vacío', {}],
      ['sin correo', { password: PASSWORD }],
      ['sin contraseña', { email: EMAIL }],
      [
        'con un campo de más',
        { email: EMAIL, password: PASSWORD, role: 'ADMIN' },
      ],
      ['con la contraseña como número', { email: EMAIL, password: 1 }],
      ['con el correo como objeto', { email: { $ne: '' }, password: PASSWORD }],
    ])('400 %s', async (_why, body) => {
      await login(body).expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    const refresh = (body: unknown) =>
      http()
        .post('/auth/refresh')
        .send(body as object);
    const start = async () => {
      await register().expect(201);
      return (await login().expect(200)).body as {
        accessToken: string;
        refreshToken: string;
        user: { id: string };
      };
    };

    it('200 con la misma forma que el login: un token de acceso y uno de refresco nuevos', async () => {
      const session = await start();

      const res = await refresh({ refreshToken: session.refreshToken }).expect(
        200,
      );

      expect(res.body).toEqual({
        accessToken: expect.stringMatching(/^[\w-]+\.[\w-]+\.[\w-]+$/),
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshToken: expect.stringMatching(/^[\w-]{43}$/),
        user: { id: session.user.id, email: EMAIL, role: 'BUYER' },
      });
      expect(res.body.refreshToken).not.toBe(session.refreshToken);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(
        await app.get(AccessTokenVerifier).verify(res.body.accessToken),
      ).toEqual({ userId: session.user.id, role: 'BUYER' });
    });

    it('el token usado ya no sirve: 401 INVALID_REFRESH_TOKEN, y la sesión entera queda revocada', async () => {
      const session = await start();
      const next = (
        await refresh({ refreshToken: session.refreshToken }).expect(200)
      ).body;

      const reuse = await refresh({
        refreshToken: session.refreshToken,
      }).expect(401);

      expect(reuse.body).toEqual({
        statusCode: 401,
        errorCode: 'INVALID_REFRESH_TOKEN',
        message: expect.any(String),
      });
      await refresh({ refreshToken: next.refreshToken }).expect(401);
    });

    it('un token desconocido o mal formado da el mismo 401', async () => {
      const bodies = [];
      for (const refreshToken of ['a'.repeat(43), 'malo']) {
        bodies.push((await refresh({ refreshToken }).expect(401)).body);
      }
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[0].errorCode).toBe('INVALID_REFRESH_TOKEN');
    });

    it('el 401 no repite el token', async () => {
      const token = 'b'.repeat(43);
      const res = await refresh({ refreshToken: token }).expect(401);
      expect(res.text).not.toContain(token);
    });

    it('400 sin cuerpo', async () => {
      await http().post('/auth/refresh').expect(400);
    });

    it.each([
      ['con un cuerpo vacío', {}],
      ['con el token vacío', { refreshToken: '' }],
      ['con el token como número', { refreshToken: 42 }],
      ['con el token como objeto', { refreshToken: { $ne: '' } }],
      [
        'con un token de más de 512 caracteres',
        { refreshToken: 'a'.repeat(513) },
      ],
      ['con un campo de más', { refreshToken: 'a'.repeat(43), userId: 'x' }],
    ])('400 %s', async (_why, body) => {
      await refresh(body).expect(400);
    });
  });

  describe('POST /auth/logout', () => {
    const logout = (body: unknown) =>
      http()
        .post('/auth/logout')
        .send(body as object);

    it('204 sin cuerpo, y la sesión deja de poder refrescarse', async () => {
      await register().expect(201);
      const { refreshToken } = (await login().expect(200)).body;

      const res = await logout({ refreshToken }).expect(204);

      expect(res.text).toBe('');
      await http().post('/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('un token desconocido o ya cerrado también da 204: no revela si existía', async () => {
      await register().expect(201);
      const { refreshToken } = (await login().expect(200)).body;
      await logout({ refreshToken }).expect(204);

      await logout({ refreshToken }).expect(204);
      await logout({ refreshToken: 'a'.repeat(43) }).expect(204);
      await logout({ refreshToken: 'malo' }).expect(204);
    });

    it('400 sin cuerpo o con un cuerpo que no es válido', async () => {
      await http().post('/auth/logout').expect(400);
      for (const body of [
        {},
        { refreshToken: '' },
        { refreshToken: 1 },
        { refreshToken: 'a'.repeat(43), extra: true },
      ]) {
        await logout(body).expect(400);
      }
    });
  });

  describe('lo que se escribe en los logs', () => {
    it('ninguna petición deja en la salida la contraseña, el hash ni el token', async () => {
      const written: string[] = [];
      const capture = (chunk: unknown) => {
        written.push(String(chunk));
        return true;
      };
      const out = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
      const err = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
      let token = '';
      let refreshToken = '';
      const secrets: string[] = [];
      try {
        await register().expect(201);
        await register().expect(409);
        await login({ email: EMAIL, password: 'otra contraseña buena' }).expect(
          401,
        );
        const session = (await login().expect(200)).body;
        token = session.accessToken;
        refreshToken = session.refreshToken;
        const next = (
          await http().post('/auth/refresh').send({ refreshToken }).expect(200)
        ).body;
        await http().post('/auth/refresh').send({ refreshToken }).expect(401);
        await http()
          .post('/auth/logout')
          .send({ refreshToken: next.refreshToken })
          .expect(204);
        secrets.push(next.refreshToken);
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      const [{ password_hash: hash }] = await query<{ password_hash: string }>(
        'SELECT password_hash FROM identity.users',
      );

      const output = written.join('');
      for (const secret of [
        PASSWORD,
        'otra contraseña buena',
        hash,
        token,
        refreshToken,
        ...secrets,
      ]) {
        expect(output).not.toContain(secret);
      }
    });
  });

  describe('la documentación', () => {
    it('describe las dos rutas, con los errores que pueden dar', async () => {
      const res = await http().get('/docs-json').expect(200);

      const registerDoc = res.body.paths['/auth/register'].post;
      const loginDoc = res.body.paths['/auth/login'].post;
      expect(Object.keys(registerDoc.responses)).toEqual(
        expect.arrayContaining(['201', '400', '409', '422']),
      );
      expect(Object.keys(loginDoc.responses)).toEqual(
        expect.arrayContaining(['200', '400', '401']),
      );
      expect(
        Object.keys(res.body.paths['/auth/refresh'].post.responses),
      ).toEqual(expect.arrayContaining(['200', '400', '401']));
      expect(
        Object.keys(res.body.paths['/auth/logout'].post.responses),
      ).toEqual(expect.arrayContaining(['204', '400']));
    });
  });
});
