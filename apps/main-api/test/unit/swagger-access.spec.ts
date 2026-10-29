import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Public } from '../../src/platform/auth/public.decorator.js';
import { Roles } from '../../src/platform/auth/roles.decorator.js';
import { configureSwagger } from '../../src/platform/http/configure-swagger.js';

// Controladores de prueba SIN ninguna respuesta 401 ni 403 documentada a mano: lo que aparezca lo puso la documentación
@Controller('docs-open')
class OpenController {
  @Public()
  @Get()
  @ApiOkResponse({ description: 'ok' })
  open() {
    return {};
  }
}

@Controller('docs-session')
class SessionController {
  @Get()
  @ApiOkResponse({ description: 'ok' })
  anyone() {
    return {};
  }

  @Roles('ADMIN')
  @Get('admin')
  @ApiOkResponse({ description: 'ok' })
  admin() {
    return {};
  }

  @Roles('BUYER', 'ADMIN')
  @Get('either')
  @ApiOkResponse({ description: 'ok' })
  either() {
    return {};
  }
}

describe('configureSwagger: acceso de cada ruta', () => {
  let app: INestApplication;
  let paths: Record<
    string,
    {
      get: {
        security?: unknown[];
        responses: Record<string, { description: string }>;
      };
    }
  >;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OpenController, SessionController],
    }).compile();
    app = moduleRef.createNestApplication();
    configureSwagger(app);
    await app.init();
    paths = (await request(app.getHttpServer()).get('/docs-json').expect(200))
      .body.paths;
  });
  afterAll(async () => {
    await app.close();
  });

  it('una ruta pública no pide credenciales ni documenta un 401', () => {
    expect(paths['/docs-open'].get.security).toEqual([]);
    expect(Object.keys(paths['/docs-open'].get.responses)).toEqual(['200']);
  });

  it('una ruta sin decoradores pide sesión: Bearer y un 401, y ningún 403', () => {
    const operation = paths['/docs-session'].get;
    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(operation.responses).sort()).toEqual(['200', '401']);
  });

  it('una ruta con rol añade el 403 y nombra el rol', () => {
    const operation = paths['/docs-session/admin'].get;
    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '401',
      '403',
    ]);
    expect(operation.responses['403'].description).toContain('ADMIN');
  });

  it('con varios roles los nombra todos', () => {
    expect(
      paths['/docs-session/either'].get.responses['403'].description,
    ).toContain('BUYER o ADMIN');
  });

  it('el 401 explica los dos códigos posibles', () => {
    const { description } = paths['/docs-session'].get.responses['401'];
    expect(description).toContain('UNAUTHENTICATED');
    expect(description).toContain('TOKEN_EXPIRED');
  });
});
