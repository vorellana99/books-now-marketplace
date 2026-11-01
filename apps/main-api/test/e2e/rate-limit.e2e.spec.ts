import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { HealthModule } from '../../src/platform/health/health.module.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const PASSWORD = 'una contraseña larga y buena';
const WINDOW = 2; // segundos
const LIMITS = {
  RATE_LIMIT_WINDOW_SECONDS: String(WINDOW),
  RATE_LIMIT_LOGIN_IP: '3',
  RATE_LIMIT_LOGIN_ACCOUNT: '2',
  RATE_LIMIT_REGISTER_IP: '2',
  RATE_LIMIT_REFRESH_IP: '3',
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Cada test usa su propia dirección (con TRUST_PROXY=1 se toma de X-Forwarded-For) y sus propios correos: los contadores
// viven en memoria y duran lo que la ventana
let nextIp = 0;
const freshIp = () => `10.1.${Math.floor(++nextIp / 250)}.${nextIp % 250}`;

describe('Límite de intentos (e2e, aplicación y PostgreSQL reales)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createHttpApp(
      [OutboxModule, IdentityModule, AUTH_MODULE, CatalogModule, HealthModule],
      { ...LIMITS, TRUST_PROXY: '1' },
    );
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const http = () => request(app.getHttpServer());
  const login = (
    ip: string,
    email: string,
    password = 'mala contraseña larga',
  ) =>
    http()
      .post('/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email, password });
  const register = (ip: string, email: string, password = PASSWORD) =>
    http()
      .post('/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ email, password });
  const uniqueEmail = () => `u${randomUUID().slice(0, 8)}@example.com`;

  describe('POST /auth/login por dirección', () => {
    it('deja pasar los intentos permitidos aunque fallen, y corta el siguiente con 429', async () => {
      const ip = freshIp();
      for (let i = 0; i < 3; i++) {
        await login(ip, uniqueEmail()).expect(401);
      }

      const blocked = await login(ip, uniqueEmail()).expect(429);

      expect(blocked.body).toEqual({
        statusCode: 429,
        errorCode: 'TOO_MANY_REQUESTS',
        message: expect.stringMatching(/Demasiados intentos/),
      });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
      expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(
        WINDOW,
      );
    });

    it('una vez cortada, ni las credenciales correctas pasan', async () => {
      const email = uniqueEmail();
      await register(freshIp(), email).expect(201);
      const ip = freshIp();
      for (let i = 0; i < 3; i++) await login(ip, uniqueEmail()).expect(401);

      await login(ip, email, PASSWORD).expect(429);
    });

    it('otra dirección no se ve afectada', async () => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await login(ip, uniqueEmail());

      await login(freshIp(), uniqueEmail()).expect(401);
    });

    it('cuenta también los intentos con un cuerpo inválido (el límite va antes de la validación)', async () => {
      const ip = freshIp();
      for (let i = 0; i < 3; i++) {
        await http()
          .post('/auth/login')
          .set('X-Forwarded-For', ip)
          .send({})
          .expect(400);
      }
      await http()
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({})
        .expect(429);
    });

    it('se recupera cuando pasa la ventana', async () => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await login(ip, uniqueEmail());
      await login(ip, uniqueEmail()).expect(429);

      await sleep(WINDOW * 1000 + 300);

      await login(ip, uniqueEmail()).expect(401);
    });
  });

  describe('POST /auth/login por cuenta', () => {
    it('corta los intentos contra el mismo correo aunque vengan de direcciones distintas', async () => {
      const email = uniqueEmail();
      await login(freshIp(), email).expect(401);
      await login(freshIp(), email).expect(401);

      const blocked = await login(freshIp(), email).expect(429);

      expect(blocked.body.errorCode).toBe('TOO_MANY_REQUESTS');
    });

    it('el correo cuenta igual con otras mayúsculas o espacios', async () => {
      const email = uniqueEmail();
      await login(freshIp(), email.toUpperCase()).expect(401);
      await login(freshIp(), ` ${email} `).expect(401);

      await login(freshIp(), email).expect(429);
    });

    it('otro correo no se ve afectado', async () => {
      const email = uniqueEmail();
      for (let i = 0; i < 3; i++) await login(freshIp(), email);

      await login(freshIp(), uniqueEmail()).expect(401);
    });

    it('los inicios de sesión correctos también cuentan', async () => {
      const email = uniqueEmail();
      await register(freshIp(), email).expect(201);
      await login(freshIp(), email, PASSWORD).expect(200);
      await login(freshIp(), email, PASSWORD).expect(200);

      await login(freshIp(), email, PASSWORD).expect(429);
    });

    it('una cuenta cortada se recupera cuando pasa la ventana', async () => {
      const email = uniqueEmail();
      for (let i = 0; i < 3; i++) await login(freshIp(), email);
      await login(freshIp(), email).expect(429);

      await sleep(WINDOW * 1000 + 300);

      await login(freshIp(), email).expect(401);
    });

    it('un correo que no es texto no rompe el límite: cae en el de su dirección', async () => {
      const ip = freshIp();
      for (let i = 0; i < 3; i++) {
        await http()
          .post('/auth/login')
          .set('X-Forwarded-For', ip)
          .send({ email: { a: 1 }, password: PASSWORD })
          .expect(400);
      }
      await login(ip, uniqueEmail()).expect(429);
    });

    it('el correo muy largo no crea una clave sin tope', async () => {
      const ip = freshIp();
      const huge = `${'a'.repeat(100_000)}@example.com`;
      await http()
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: huge, password: PASSWORD })
        .expect(400);
    });
  });

  describe('POST /auth/register', () => {
    it('corta por dirección, también con cuerpos inválidos', async () => {
      const ip = freshIp();
      await register(ip, uniqueEmail()).expect(201);
      await register(ip, 'sin-arroba').expect(422);

      await register(ip, uniqueEmail()).expect(429);
    });

    it('otra dirección no se ve afectada', async () => {
      const ip = freshIp();
      await register(ip, uniqueEmail());
      await register(ip, uniqueEmail());
      await register(ip, uniqueEmail()).expect(429);

      await register(freshIp(), uniqueEmail()).expect(201);
    });
  });

  describe('POST /auth/refresh y /auth/logout', () => {
    const refresh = (ip: string) =>
      http()
        .post('/auth/refresh')
        .set('X-Forwarded-For', ip)
        .send({ refreshToken: 'a'.repeat(43) });
    const logout = (ip: string) =>
      http()
        .post('/auth/logout')
        .set('X-Forwarded-For', ip)
        .send({ refreshToken: 'a'.repeat(43) });

    it('comparten el límite por dirección', async () => {
      const ip = freshIp();
      await refresh(ip).expect(401);
      await logout(ip).expect(204);
      await refresh(ip).expect(401);

      await refresh(ip).expect(429);
      await logout(ip).expect(429);
    });

    it('otra dirección no se ve afectada', async () => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await refresh(ip);
      await refresh(freshIp()).expect(401);
    });
  });

  describe('lo que no se limita', () => {
    it('el catálogo y la salud responden siempre, aunque la dirección esté cortada en el login', async () => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await login(ip, uniqueEmail());

      for (let i = 0; i < 40; i++) {
        await http().get('/books').set('X-Forwarded-For', ip).expect(200);
      }
      await http().get('/health/live').set('X-Forwarded-For', ip).expect(200);
    });

    it('el límite de un grupo no gasta el de otro', async () => {
      const ip = freshIp();
      for (let i = 0; i < 4; i++) await login(ip, uniqueEmail());

      await register(ip, uniqueEmail()).expect(201);
    });
  });

  describe('la respuesta 429', () => {
    it('no filtra los contadores internos ni los nombres de los límites', async () => {
      const ip = freshIp();
      for (let i = 0; i < 3; i++) await login(ip, uniqueEmail());
      const blocked = await login(ip, uniqueEmail()).expect(429);
      const allowed = await login(freshIp(), uniqueEmail()).expect(401);

      for (const res of [blocked, allowed]) {
        const names = Object.keys(res.headers).filter((h) =>
          /ratelimit|retry-after-/i.test(h),
        );
        expect(names).toEqual([]);
      }
      expect(JSON.stringify(blocked.body)).not.toMatch(/login-|account|ip:/i);
    });

    it('deja un aviso con el requestId, la ruta y el límite superado, sin el correo ni la contraseña', async () => {
      const seen: { message: string; requestId?: string }[] = [];
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message: unknown) => {
          seen.push({
            message: String(message),
            requestId: RequestContext.requestId(),
          });
        });
      const email = uniqueEmail();
      try {
        const ip = freshIp();
        for (let i = 0; i < 2; i++) await login(ip, email);
        await http()
          .post('/auth/login')
          .set('X-Forwarded-For', freshIp())
          .set('X-Request-Id', 'r-limite')
          .send({ email, password: 'x'.repeat(12) })
          .expect(429);
      } finally {
        warn.mockRestore();
      }

      const line = seen.find((l) => l.requestId === 'r-limite');
      expect(line?.message).toMatch(/Límite de intentos superado/);
      expect(line?.message).toContain('POST /auth/login');
      expect(JSON.stringify(seen)).not.toContain(email);
      expect(JSON.stringify(seen)).not.toContain('x'.repeat(12));
    });
  });
});

describe('Límite de intentos sin confiar en el proxy (TRUST_PROXY=0)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createHttpApp(
      [OutboxModule, IdentityModule, AUTH_MODULE],
      LIMITS,
    );
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  it('cambiar X-Forwarded-For no evita el límite: se cuenta la dirección real de la conexión', async () => {
    const send = (ip: string) =>
      request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', ip)
        .send({
          email: `u${randomUUID().slice(0, 8)}@example.com`,
          password: 'mala contraseña larga',
        });

    for (let i = 0; i < 3; i++) await send(`203.0.113.${i + 1}`).expect(401);

    await send('203.0.113.99').expect(429);
  });
});
