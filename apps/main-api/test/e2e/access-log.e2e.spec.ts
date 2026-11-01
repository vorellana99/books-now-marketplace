import { Logger, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { AUTH_MODULE } from '../support/auth-module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { HealthModule } from '../../src/platform/health/health.module.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';

const PASSWORD = 'una contraseña larga y buena';

describe('Registro de accesos (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createHttpApp([
      OutboxModule,
      HealthModule,
      CatalogModule,
      SalesModule,
      IdentityModule,
      AUTH_MODULE,
    ]);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  // Todo lo que la aplicación escribe en el log mientras corre `action`
  async function logged(action: () => Promise<unknown>) {
    const seen: { level: string; message: string; requestId?: string }[] = [];
    const spies = (['log', 'warn', 'error'] as const).map((level) =>
      vi
        .spyOn(Logger.prototype, level)
        .mockImplementation((message: unknown) => {
          seen.push({
            level,
            message: String(message),
            requestId: RequestContext.requestId(),
          });
        }),
    );
    try {
      await action();
      await new Promise((r) => setTimeout(r, 50)); // el evento de cierre llega justo después de responder
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    return seen.filter((l) => /^(GET|POST|PATCH|OPTIONS) /.test(l.message));
  }
  const http = () => request(app.getHttpServer());

  it('una línea por petición, con el requestId, el método, la ruta, el estado y la duración', async () => {
    const lines = await logged(async () => {
      await http().get('/books').set('X-Request-Id', 'r-acceso').expect(200);
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      level: 'log',
      requestId: 'r-acceso',
    });
    expect(lines[0].message).toMatch(/^GET \/books 200 \d+ms$/);
  });

  it('un error se escribe como aviso con su estado', async () => {
    const lines = await logged(async () => {
      await http().get('/no-existe').expect(404);
      await http().get('/me/orders').expect(401);
    });

    expect(
      lines.map((l) => [l.level, l.message.replace(/ \d+ms$/, '')]),
    ).toEqual([
      ['warn', 'GET /no-existe 404'],
      ['warn', 'GET /me/orders 401'],
    ]);
  });

  it('lleva el usuario autenticado, y no el de una petición sin sesión', async () => {
    const email = 'ana@example.com';
    const registered = await http()
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const session = await http()
      .post('/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);

    const lines = await logged(async () => {
      await http()
        .get('/me/orders')
        .set('Authorization', `Bearer ${session.body.accessToken}`)
        .expect(200);
      await http().get('/books').expect(200);
    });

    expect(lines[0].message).toContain(`usuario=${registered.body.id}`);
    expect(lines[1].message).not.toContain('usuario=');
  });

  it('nunca escribe la query, el token, la contraseña ni el correo', async () => {
    const email = 'ana@example.com';
    await http()
      .post('/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    let token = '';
    const lines = await logged(async () => {
      const login = await http()
        .post('/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200);
      token = login.body.accessToken;
      await http()
        .get('/books?q=secreto-en-la-url')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await http().get('/no-existe?access_token=otro-secreto').expect(404);
      await http()
        .post('/auth/login')
        .send({ email, password: 'mala contraseña larga' })
        .expect(401);
    });

    const text = JSON.stringify(lines);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const secret of [
      PASSWORD,
      'mala contraseña larga',
      email,
      token,
      'secreto-en-la-url',
      'otro-secreto',
      'Bearer',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('las consultas de salud no se escriben', async () => {
    const lines = await logged(async () => {
      await http().get('/health/live').expect(200);
      await http().get('/health/ready').expect(200);
    });
    expect(lines).toEqual([]);
  });
});
