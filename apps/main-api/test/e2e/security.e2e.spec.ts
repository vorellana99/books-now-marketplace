import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { HealthModule } from '../../src/platform/health/health.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { resetDatabase } from '../support/database.js';
import { createHttpApp } from '../support/http-app.js';
import { bearer } from '../support/auth.js';

const MODULES = [
  OutboxModule,
  HealthModule,
  CatalogModule,
  SalesModule,
  IdentityModule,
];
const ALLOWED = ['https://libroya.pe', 'http://localhost:5173'];

describe('Cabeceras de seguridad y CORS (e2e)', () => {
  describe('cabeceras de seguridad (helmet)', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp(MODULES);
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);
    const get = (path: string) => request(app.getHttpServer()).get(path);

    it.each([
      ['una respuesta correcta', '/books', 200],
      ['una respuesta pública de salud', '/health/live', 200],
      ['un 401', '/me/orders', 401],
      ['un 404 de una ruta que no existe', '/no-existe', 404],
    ])('%s lleva las cabeceras', async (_why, path, status) => {
      const res = await get(path).expect(status);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toMatch(
        /max-age=\d+; includeSubDomains/,
      );
      expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['content-security-policy']).toContain(
        "default-src 'self'",
      );
      expect(res.headers['content-security-policy']).toContain(
        "frame-ancestors 'self'",
      );
      expect(res.headers['content-security-policy']).toContain(
        "object-src 'none'",
      );
    });

    it('no anuncia el framework: sin X-Powered-By', async () => {
      const res = await get('/books').expect(200);
      expect(res.headers).not.toHaveProperty('x-powered-by');
    });

    it('la API no permite scripts ni estilos incrustados', async () => {
      const res = await get('/books').expect(200);
      expect(res.headers['content-security-policy']).not.toContain(
        'unsafe-inline',
      );
      expect(res.headers['content-security-policy']).not.toContain(
        'unsafe-eval',
      );
    });

    it('la documentación /docs permite lo que necesita Swagger UI (scripts y estilos propios), y nada más', async () => {
      const res = await get('/docs').redirects(1).expect(200);

      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("default-src 'self'");
      expect(csp).toMatch(/script-src [^;]*'self'/);
      expect(csp).toMatch(/script-src [^;]*'unsafe-inline'/);
      expect(csp).toMatch(/style-src [^;]*'unsafe-inline'/);
      expect(csp).not.toContain('unsafe-eval');
      expect(csp).not.toMatch(/\*/);
      expect(csp).toContain("object-src 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('el JSON de /docs-json lleva la política estricta de la API', async () => {
      const res = await get('/docs-json').expect(200);
      expect(res.headers['content-security-policy']).not.toContain(
        'unsafe-inline',
      );
    });

    it('una ruta que solo empieza como /docs no recibe la política relajada', async () => {
      const res = await get('/docsx');
      expect(res.headers['content-security-policy']).not.toContain(
        'unsafe-inline',
      );
    });
  });

  describe('CORS', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp(MODULES, { CORS_ORIGINS: ALLOWED.join(',') });
    });
    afterAll(async () => {
      await app.close();
    });
    beforeEach(resetDatabase);
    const http = () => request(app.getHttpServer());

    it('la petición previa (OPTIONS) de un origen permitido se responde sin token, con lo que necesita el navegador', async () => {
      const res = await http()
        .options('/orders')
        .set('Origin', 'https://libroya.pe')
        .set('Access-Control-Request-Method', 'POST')
        .set(
          'Access-Control-Request-Headers',
          'authorization,content-type,idempotency-key',
        )
        .expect(204);

      expect(res.headers['access-control-allow-origin']).toBe(
        'https://libroya.pe',
      );
      expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
      const headers = String(
        res.headers['access-control-allow-headers'],
      ).toLowerCase();
      for (const h of [
        'authorization',
        'content-type',
        'idempotency-key',
        'x-request-id',
      ]) {
        expect(headers).toContain(h);
      }
      expect(Number(res.headers['access-control-max-age'])).toBeGreaterThan(0);
      expect(res.headers.vary).toMatch(/Origin/);
      expect(res.headers).not.toHaveProperty(
        'access-control-allow-credentials',
      );
    });

    it('permite los métodos de la API y no otros', async () => {
      const res = await http()
        .options('/admin/books/9780132350884')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'PATCH')
        .expect(204);
      const methods = String(res.headers['access-control-allow-methods']).split(
        ',',
      );
      expect(methods.sort()).toEqual(['GET', 'PATCH', 'POST']);
    });

    it('una respuesta normal de un origen permitido lleva el origen y expone X-Request-Id y Retry-After', async () => {
      const res = await http()
        .get('/books')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:5173',
      );
      expect(res.headers.vary).toMatch(/Origin/);
      const exposed = String(
        res.headers['access-control-expose-headers'],
      ).toLowerCase();
      expect(exposed).toContain('x-request-id');
      expect(exposed).toContain('retry-after');
    });

    it('los errores también llevan el origen, para que el navegador pueda leerlos', async () => {
      const unauthorized = await http()
        .get('/me/orders')
        .set('Origin', 'https://libroya.pe')
        .expect(401);
      expect(unauthorized.headers['access-control-allow-origin']).toBe(
        'https://libroya.pe',
      );

      const forbidden = await http()
        .get('/admin/orders?customerId=x')
        .set('Origin', 'https://libroya.pe')
        .set(await bearer(app, 'BUYER'))
        .expect(403);
      expect(forbidden.headers['access-control-allow-origin']).toBe(
        'https://libroya.pe',
      );
    });

    it.each([
      ['un origen que no está en la lista', 'https://evil.example'],
      ['el mismo dominio con otro esquema', 'http://libroya.pe'],
      ['el mismo dominio con otro puerto', 'https://libroya.pe:444'],
      ['un subdominio', 'https://app.libroya.pe'],
      ['un dominio que lo contiene', 'https://libroya.pe.evil.example'],
      ['el origen null', 'null'],
      ['mayúsculas distintas', 'HTTPS://LIBROYA.PE'],
    ])('no admite %s', async (_why, origin) => {
      const preflight = await http()
        .options('/orders')
        .set('Origin', origin)
        .set('Access-Control-Request-Method', 'POST');
      const simple = await http().get('/books').set('Origin', origin);

      for (const res of [preflight, simple]) {
        expect(res.headers).not.toHaveProperty('access-control-allow-origin');
      }
      expect(simple.status).toBe(200); // la API responde igual: CORS lo hace cumplir el navegador
    });

    it('sin cabecera Origin no añade cabeceras CORS', async () => {
      const res = await http().get('/books').expect(200);
      expect(res.headers).not.toHaveProperty('access-control-allow-origin');
    });

    it('no admite credenciales (cookies): la API usa el encabezado Authorization', async () => {
      const res = await http()
        .get('/books')
        .set('Origin', 'https://libroya.pe')
        .expect(200);
      expect(res.headers).not.toHaveProperty(
        'access-control-allow-credentials',
      );
    });
  });

  describe('sin CORS_ORIGINS (el valor por defecto)', () => {
    let app: INestApplication;
    beforeAll(async () => {
      app = await createHttpApp(MODULES);
    });
    afterAll(async () => {
      await app.close();
    });

    it('ningún origen recibe cabeceras CORS, ni en la petición previa ni en la normal', async () => {
      const http = () => request(app.getHttpServer());
      const preflight = await http()
        .options('/orders')
        .set('Origin', 'https://libroya.pe')
        .set('Access-Control-Request-Method', 'POST');
      const simple = await http()
        .get('/books')
        .set('Origin', 'https://libroya.pe')
        .expect(200);

      for (const res of [preflight, simple]) {
        expect(res.headers).not.toHaveProperty('access-control-allow-origin');
        expect(res.headers).not.toHaveProperty('access-control-allow-methods');
      }
    });
  });
});
