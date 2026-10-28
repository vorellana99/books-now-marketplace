import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ModulesContainer } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { bearer } from '../support/auth.js';

type Access = 'public' | 'authenticated' | 'BUYER' | 'ADMIN';

// Cada ruta de la aplicación y quién puede llamarla. Si se añade una ruta, este test falla hasta que se decida aquí:
// con el denegado por defecto, olvidarse nunca deja una ruta abierta, pero tampoco pasa inadvertida
const EXPECTED: Record<string, Access> = {
  'GET /health/live': 'public',
  'GET /health/ready': 'public',
  'GET /health/outbox': 'public',
  'GET /books': 'public',
  'GET /books/:isbn': 'public',
  'POST /auth/register': 'public',
  'POST /auth/login': 'public',
  'POST /auth/refresh': 'public',
  'POST /auth/logout': 'public',
  'POST /orders': 'BUYER',
  'GET /me/orders': 'BUYER',
  'GET /admin/orders': 'ADMIN',
  'GET /orders/:id': 'authenticated',
  'POST /admin/books': 'ADMIN',
  'PATCH /admin/books/:isbn': 'ADMIN',
  'POST /admin/stock/:isbn/additions': 'ADMIN',
};

const join = (...parts: string[]) =>
  `/${parts
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;

// Las rutas, tal como las declaran los controladores de todos los módulos
function declaredRoutes(app: INestApplication): string[] {
  const routes: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      const prefix = Reflect.getMetadata(PATH_METADATA, controller) as
        string | string[];
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name] as object;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as
          string | string[];
        routes.push(
          `${RequestMethod[method]} ${join([prefix].flat()[0], [path].flat()[0])}`,
        );
      }
    }
  }
  return routes.sort((a, b) => a.localeCompare(b));
}

describe('Acceso a las rutas (e2e, aplicación completa)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  const call = (route: string, headers: Record<string, string> = {}) => {
    const [method, path] = route.split(' ');
    const url = path.replaceAll(/:\w+/g, 'x');
    const http = request(app.getHttpServer());
    const req =
      method === 'GET'
        ? http.get(url)
        : method === 'PATCH'
          ? http.patch(url)
          : http.post(url);
    return req.set(headers).send(method === 'GET' ? undefined : {});
  };

  it('la tabla esperada cubre exactamente las rutas que declaran los controladores', () => {
    expect(declaredRoutes(app)).toEqual(Object.keys(EXPECTED).sort());
  });

  it.each(Object.entries(EXPECTED))('%s es %s', async (route, access) => {
    // Sin token: cerrada (401) o abierta (cualquier otra respuesta)
    const anonymous = await call(route);
    if (access === 'public') {
      expect(anonymous.status, route).not.toBe(401);
      expect(anonymous.status, route).not.toBe(403);
      return;
    }
    expect(anonymous.status, route).toBe(401);
    expect(anonymous.body.errorCode).toBe('UNAUTHENTICATED');

    // Un comprador: entra, salvo en las de administrador (403)
    const buyer = await call(route, await bearer(app, 'BUYER'));
    if (access === 'ADMIN') {
      expect(buyer.status, route).toBe(403);
      expect(buyer.body.errorCode).toBe('FORBIDDEN');
    } else {
      expect(buyer.status, route).not.toBe(401);
      expect(buyer.status, route).not.toBe(403);
    }

    // Un administrador entra, salvo en las de comprador (403). Lo demás puede ser un 400 o un 404 por los datos de prueba
    const admin = await call(route, await bearer(app, 'ADMIN'));
    expect(admin.status, route).not.toBe(401);
    if (access === 'BUYER') {
      expect(admin.status, route).toBe(403);
    } else {
      expect(admin.status, route).not.toBe(403);
    }
  });

  it('un token vencido, alterado o de otro tipo no abre ninguna ruta cerrada', async () => {
    const good = (await bearer(app, 'ADMIN')).Authorization;
    const tampered = `${good.slice(0, -2)}xx`;
    for (const [route, access] of Object.entries(EXPECTED)) {
      if (access === 'public') continue;
      for (const Authorization of [
        tampered,
        'Bearer no.es.un-token',
        'Basic YWRtaW46YWRtaW4=',
      ]) {
        const res = await call(route, { Authorization });
        expect(res.status, `${route} con ${Authorization.slice(0, 12)}`).toBe(
          401,
        );
      }
    }
  });
});
