import {
  Body,
  Controller,
  Get,
  type INestApplication,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { IsInt, IsString } from 'class-validator';
import request from 'supertest';
import { AdminApi } from '../../src/platform/http/admin-api.decorator.js';
import { AdminApiEnabledGuard } from '../../src/platform/http/admin-api-enabled.guard.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { configureSwagger } from '../../src/platform/http/configure-swagger.js';

class CreateDto {
  @IsString() name!: string;
  @IsInt() amount!: number;
}

// Un controlador de administración (el guard en la clase), como los de /admin
@AdminApi()
@Controller('admin/things')
class AdminThingsController {
  @Get()
  list() {
    return { ok: 'admin' };
  }

  @Post()
  create(@Body() dto: CreateDto) {
    return { created: dto.name };
  }
}

// Un controlador mixto, como OrderController: una ruta abierta y otra solo de administración (el guard en el método)
@Controller('mixed')
class MixedController {
  @Post()
  open(@Body() dto: CreateDto) {
    return { opened: dto.name };
  }

  @AdminApi()
  @Get()
  history() {
    return { ok: 'history' };
  }
}

describe('AdminApiEnabledGuard y @AdminApi()', () => {
  let app: INestApplication;
  // Lo que responde ConfigService para ADMIN_API_ENABLED; cada test lo cambia
  let flag: unknown;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminThingsController, MixedController],
      providers: [
        AdminApiEnabledGuard,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'ADMIN_API_ENABLED' ? flag : undefined,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    configureSwagger(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('con ADMIN_API_ENABLED=false', () => {
    beforeEach(() => {
      flag = false;
    });

    it('las rutas de administración responden 404', async () => {
      await http().get('/admin/things').expect(404);
      await http()
        .post('/admin/things')
        .send({ name: 'x', amount: 1 })
        .expect(404);
    });

    it('el 404 es idéntico al de una ruta que no existe, salvo la ruta que menciona', async () => {
      const guarded = await http().get('/admin/things').expect(404);
      const missing = await http().get('/admin/no-existe').expect(404);

      expect(guarded.body).toEqual({
        message: 'Cannot GET /admin/things',
        error: 'Not Found',
        statusCode: 404,
      });
      expect(Object.keys(guarded.body)).toEqual(Object.keys(missing.body));
      expect(missing.body.message).toBe('Cannot GET /admin/no-existe');
    });

    it('también para POST: el mensaje dice POST y la ruta', async () => {
      const res = await http()
        .post('/admin/things')
        .send({ name: 'x', amount: 1 })
        .expect(404);
      expect(res.body.message).toBe('Cannot POST /admin/things');
    });

    it('un cuerpo inválido da 404 y no 400: el guard va antes que la validación, y no revela que la ruta existe', async () => {
      await http().post('/admin/things').send({ nada: true }).expect(404);
    });

    it('un guard de método cierra solo su método: la ruta abierta del mismo controlador sigue funcionando', async () => {
      await http().get('/mixed').expect(404);
      const open = await http()
        .post('/mixed')
        .send({ name: 'x', amount: 1 })
        .expect(201);
      expect(open.body).toEqual({ opened: 'x' });
    });

    it('la respuesta lleva igualmente el X-Request-Id', async () => {
      const res = await http()
        .get('/admin/things')
        .set('X-Request-Id', 'r-admin')
        .expect(404);
      expect(res.headers['x-request-id']).toBe('r-admin');
    });
  });

  describe('con ADMIN_API_ENABLED=true', () => {
    beforeEach(() => {
      flag = true;
    });

    it('las rutas de administración responden', async () => {
      const list = await http().get('/admin/things').expect(200);
      expect(list.body).toEqual({ ok: 'admin' });
      const created = await http()
        .post('/admin/things')
        .send({ name: 'x', amount: 1 })
        .expect(201);
      expect(created.body).toEqual({ created: 'x' });
    });

    it('con el guard abierto la validación vuelve a ser 400', async () => {
      await http().post('/admin/things').send({ nada: true }).expect(400);
    });

    it('la ruta con guard de método también responde', async () => {
      await http().get('/mixed').expect(200);
    });
  });

  describe('si la variable no es exactamente true, la administración queda cerrada', () => {
    it.each([
      ['no está definida', undefined],
      ['es null', null],
      ['es el texto "true"', 'true'],
      ['es el número 1', 1],
      ['es el texto "false"', 'false'],
    ])('%s', async (_caso, value) => {
      flag = value;
      await http().get('/admin/things').expect(404);
    });
  });

  it('se evalúa en cada petición: cambiar la variable cambia la respuesta sin reiniciar', async () => {
    flag = false;
    await http().get('/admin/things').expect(404);
    flag = true;
    await http().get('/admin/things').expect(200);
    flag = false;
    await http().get('/admin/things').expect(404);
  });

  // El documento de Swagger se calcula una vez y se guarda: la variable no cambia en caliente en una aplicación real,
  // así que cada valor se prueba con su propia aplicación
  describe('Swagger', () => {
    async function docWith(enabled: boolean) {
      const moduleRef = await Test.createTestingModule({
        controllers: [AdminThingsController, MixedController],
        providers: [
          AdminApiEnabledGuard,
          {
            provide: ConfigService,
            useValue: {
              get: (key: string) =>
                key === 'ADMIN_API_ENABLED' ? enabled : undefined,
            },
          },
        ],
      }).compile();
      const own = moduleRef.createNestApplication();
      configureApp(own);
      configureSwagger(own);
      await own.init();
      try {
        const res = await request(own.getHttpServer())
          .get('/docs-json')
          .expect(200);
        return res.body.paths as Record<
          string,
          Record<string, { tags?: string[] }>
        >;
      } finally {
        await own.close();
      }
    }

    it('con la administración cerrada, /docs no muestra las rutas de administración', async () => {
      const doc = await docWith(false);
      expect(Object.keys(doc)).not.toContain('/admin/things');
      // la ruta abierta de un controlador mixto se queda; la de administración, no
      expect(doc['/mixed']?.post).toBeDefined();
      expect(doc['/mixed']?.get).toBeUndefined();
    });

    it('con la administración abierta, las muestra con la etiqueta admin', async () => {
      const doc = await docWith(true);
      expect(doc['/admin/things'].get.tags).toContain('admin');
      expect(doc['/admin/things'].post.tags).toContain('admin');
      expect(doc['/mixed'].get.tags).toContain('admin');
      expect(doc['/mixed'].post.tags ?? []).not.toContain('admin');
    });

    it('cualquier valor que no sea exactamente true también las oculta', async () => {
      const doc = await docWith('true' as unknown as boolean);
      expect(Object.keys(doc)).not.toContain('/admin/things');
    });
  });
});
