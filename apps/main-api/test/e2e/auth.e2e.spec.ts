import { Module, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
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
    app = await createHttpApp([OutboxModule, IdentityModule, Probes]);
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
      try {
        await register().expect(201);
        await register().expect(409);
        await login({ email: EMAIL, password: 'otra contraseña buena' }).expect(
          401,
        );
        token = (await login().expect(200)).body.accessToken;
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      const [{ password_hash: hash }] = await query<{ password_hash: string }>(
        'SELECT password_hash FROM identity.users',
      );

      const output = written.join('');
      for (const secret of [PASSWORD, 'otra contraseña buena', hash, token]) {
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
    });
  });
});
