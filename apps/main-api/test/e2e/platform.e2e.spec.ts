import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';

describe('Platform (e2e, PostgreSQL real)', () => {
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

  it('GET /health/live responde 200 sin tocar la BD', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok' });
  });

  it('GET /health/ready responde 200 con la BD arriba', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);
    expect(res.body.details.database.status).toBe('up');
  });

  it('devuelve el X-Request-Id recibido', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'r-test');
    expect(res.headers['x-request-id']).toBe('r-test');
  });

  it('genera un X-Request-Id si falta o tiene formato inválido', async () => {
    const missing = await request(app.getHttpServer()).get('/health/live');
    expect(missing.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    const invalid = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'a b<c>');
    expect(invalid.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('incluso una ruta inexistente (404) lleva el X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-existe')
      .expect(404);
    expect(res.headers['x-request-id']).toBeDefined();
  });
});

describe('Platform (e2e, BD caída)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Sin conectar a ninguna base: la consulta de salud siempre falla
    const prisma = {
      $connect: async () => undefined,
      $disconnect: async () => undefined,
      $queryRaw: async () => {
        throw new Error('conexión rechazada');
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/ready responde 503 si la BD no responde', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(503);
    expect(res.body.details.database.status).toBe('down');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('GET /health/live sigue en 200 aunque la BD esté caída', async () => {
    await request(app.getHttpServer())
      .get('/health/live')
      .expect(200, { status: 'ok' });
  });
});
