import {
  Controller,
  Get,
  Logger,
  Module,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { Public } from '../../src/platform/auth/public.decorator.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { bearer } from '../support/auth.js';
import { resetDatabase } from '../support/database.js';

const SECRET = 'postgres://usuario:clave-secreta@db/libroya';

// Una ruta que falla como lo haría un error de programación: nada de dominio ni de Nest
@Controller('boom')
class BoomController {
  @Public()
  @Get()
  boom(): never {
    throw new Error(`connection refused ${SECRET}`);
  }
}

@Module({ controllers: [BoomController] })
class BoomModule {}

// Toda respuesta de error de la API tiene la misma forma, venga de donde venga el error: { statusCode, errorCode, message }
describe('Formato de error uniforme (e2e, PostgreSQL real)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    await resetDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, BoomModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  function expectShape(
    body: Record<string, unknown>,
    statusCode: number,
    errorCode: string,
  ) {
    expect(body.statusCode).toBe(statusCode);
    expect(body.errorCode).toBe(errorCode);
    expect(typeof body.message).toBe('string');
    expect((body.message as string).length).toBeGreaterThan(0);
  }

  describe('validación: 400 VALIDATION_ERROR', () => {
    it('un cuerpo con campos que faltan: message fijo y details con la lista', async () => {
      const res = await http.post('/auth/login').send({}).expect(400);
      expectShape(res.body, 400, 'VALIDATION_ERROR');
      expect(res.body.message).toBe('La petición no es válida');
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(res.body.details.length).toBeGreaterThan(0);
      expect(
        res.body.details.every((d: unknown) => typeof d === 'string'),
      ).toBe(true);
    });

    it('un campo de más también es de validación', async () => {
      const res = await http
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'x', extra: 1 })
        .expect(400);
      expectShape(res.body, 400, 'VALIDATION_ERROR');
      expect(JSON.stringify(res.body.details)).toContain('extra');
    });

    it('un JSON mal formado', async () => {
      const res = await http
        .post('/auth/login')
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expectShape(res.body, 400, 'VALIDATION_ERROR');
    });

    it('un id que no es un UUID', async () => {
      const res = await http
        .get('/orders/no-es-un-uuid')
        .set(await bearer(app, 'BUYER'))
        .expect(400);
      expectShape(res.body, 400, 'VALIDATION_ERROR');
    });

    it('un error lanzado a mano en el controlador (falta Idempotency-Key): sin details', async () => {
      const res = await http
        .post('/orders')
        .set(await bearer(app, 'BUYER'))
        .send({
          cardToken: 'tok_visa',
          items: [{ isbn: '9780132350884', quantity: 1 }],
          shippingAddress: {
            recipient: 'Ana',
            phone: '+51 999 888 777',
            line1: 'Av. Larco 123',
            district: 'Miraflores',
            province: 'Lima',
            department: 'Lima',
          },
        })
        .expect(400);
      expectShape(res.body, 400, 'VALIDATION_ERROR');
      expect('details' in res.body).toBe(false);
    });
  });

  describe('ruta inexistente: 404 ROUTE_NOT_FOUND', () => {
    it('una ruta que no existe', async () => {
      const res = await http.get('/no-existe').expect(404);
      expectShape(res.body, 404, 'ROUTE_NOT_FOUND');
    });

    it('un método que la ruta no tiene', async () => {
      const res = await http.post('/health/live').expect(404);
      expectShape(res.body, 404, 'ROUTE_NOT_FOUND');
    });

    it('no se confunde con el NOT_FOUND de dominio (un libro que no existe)', async () => {
      const res = await http.get('/books/9780132350884').expect(404);
      expectShape(res.body, 404, 'NOT_FOUND');
    });
  });

  describe('cuerpo demasiado grande: 413 PAYLOAD_TOO_LARGE', () => {
    it('supera el límite del cuerpo', async () => {
      const res = await http
        .post('/auth/login')
        .send({ email: 'a@b.com', password: 'x'.repeat(2_000_000) })
        .expect(413);
      expectShape(res.body, 413, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('error inesperado: 500 INTERNAL_ERROR', () => {
    beforeEach(() => {
      // el filtro registra el error inesperado; aquí no ensucia la salida de las pruebas
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('responde el error genérico y no revela el interno', async () => {
      const res = await http.get('/boom').expect(500);
      expectShape(res.body, 500, 'INTERNAL_ERROR');
      expect(res.body.message).toBe('Error interno del servidor');
      expect(JSON.stringify(res.body)).not.toContain('clave-secreta');
      expect(JSON.stringify(res.body)).not.toContain('connection refused');
    });

    it('lleva el X-Request-Id recibido, para buscarlo en los logs', async () => {
      const res = await http
        .get('/boom')
        .set('X-Request-Id', 'r-9-1-prueba')
        .expect(500);
      expect(res.headers['x-request-id']).toBe('r-9-1-prueba');
    });
  });

  describe('lo que no cambia', () => {
    it('un error de dominio sigue con su código y su estado', async () => {
      const res = await http.get('/books/123').expect(422);
      expectShape(res.body, 422, 'INVALID_ISBN');
    });

    it('sin token sigue siendo 401 UNAUTHENTICATED', async () => {
      const res = await http.get('/me/orders').expect(401);
      expectShape(res.body, 401, 'UNAUTHENTICATED');
    });

    it('un comprador en una ruta de administración sigue siendo 403 FORBIDDEN', async () => {
      const res = await http
        .get('/admin/orders')
        .set(await bearer(app, 'BUYER'))
        .expect(403);
      expectShape(res.body, 403, 'FORBIDDEN');
    });

    it('la salud conserva su propio cuerpo (la lee el balanceador)', async () => {
      const res = await http.get('/health/ready').expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  it('toda respuesta de error lleva el X-Request-Id', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    for (const path of ['/no-existe', '/books/123', '/boom']) {
      const res = await http.get(path);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers['x-request-id']).toBeDefined();
    }
  });
});
