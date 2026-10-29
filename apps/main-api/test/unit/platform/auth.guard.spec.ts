import { Controller, Get, Logger, type INestApplication } from '@nestjs/common';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthGuard } from '../../../src/platform/auth/auth.guard.js';
import {
  AccessTokenVerifier,
  TokenVerificationError,
} from '../../../src/platform/auth/access-token-verifier.js';
import type { AuthenticatedUser } from '../../../src/platform/auth/authenticated-user.js';
import { CurrentUser } from '../../../src/platform/auth/current-user.decorator.js';
import { Public } from '../../../src/platform/auth/public.decorator.js';
import { Roles } from '../../../src/platform/auth/roles.decorator.js';
import { configureApp } from '../../../src/platform/http/configure-app.js';
import { RequestContext } from '../../../src/platform/observability/request-context.js';

const ANA: AuthenticatedUser = {
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'BUYER',
};
const ADMIN: AuthenticatedUser = {
  userId: '99999999-9999-4999-8999-999999999999',
  role: 'ADMIN',
};

// Rutas de prueba con cada combinación de decoradores
@Controller('plain')
class PlainController {
  @Get()
  closed(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Public()
  @Get('open')
  open(@CurrentUser() user?: AuthenticatedUser) {
    return { user: user ?? null };
  }

  @Roles('ADMIN')
  @Get('admin')
  admin(@CurrentUser() user: AuthenticatedUser) {
    return { user };
  }

  @Roles('BUYER', 'ADMIN')
  @Get('either')
  either() {
    return { ok: true };
  }
}

@Public()
@Controller('pub')
class PublicController {
  @Get()
  open() {
    return { ok: true };
  }

  @Roles('ADMIN')
  @Get('admin')
  admin() {
    return { ok: true };
  }
}

@Roles('ADMIN')
@Controller('adm')
class AdminController {
  @Get()
  admin() {
    return { ok: true };
  }

  @Roles('BUYER')
  @Get('buyer')
  buyer() {
    return { ok: true };
  }

  @Public()
  @Get('open')
  open() {
    return { ok: true };
  }
}

// Declaradas a la vez en la misma ruta: gana lo más estricto
@Controller('both')
class BothController {
  @Public()
  @Roles('ADMIN')
  @Get()
  both() {
    return { ok: true };
  }
}

describe('AuthGuard', () => {
  let app: INestApplication;
  let verify: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    verify = vi.fn(async (token: string): Promise<AuthenticatedUser> => {
      if (token === 'ana') return ANA;
      if (token === 'admin') return ADMIN;
      if (token === 'vencido') throw new TokenVerificationError('expired');
      if (token === 'rol-raro') {
        return { userId: ANA.userId, role: 'SUPERUSER' as never };
      }
      throw new TokenVerificationError('invalid');
    });
    const moduleRef = await Test.createTestingModule({
      controllers: [
        PlainController,
        PublicController,
        AdminController,
        BothController,
      ],
      providers: [
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: AccessTokenVerifier, useValue: { verify } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  describe('denegado por defecto', () => {
    it('una ruta sin decoradores exige iniciar sesión: 401 UNAUTHENTICATED', async () => {
      const res = await http().get('/plain').expect(401);

      expect(res.body).toEqual({
        statusCode: 401,
        errorCode: 'UNAUTHENTICATED',
        message: expect.any(String),
      });
    });

    it('con un token válido entra, sea cual sea su rol', async () => {
      const res = await http().get('/plain').set(as('ana')).expect(200);
      expect(res.body).toEqual({ user: ANA });
      await http().get('/plain').set(as('admin')).expect(200);
    });

    it('el 401 pide credenciales Bearer', async () => {
      const res = await http().get('/plain').expect(401);
      expect(res.headers['www-authenticate']).toBe('Bearer');
    });
  });

  describe('@Public()', () => {
    it('abre la ruta sin token', async () => {
      const res = await http().get('/plain/open').expect(200);
      expect(res.body).toEqual({ user: null });
      expect(verify).not.toHaveBeenCalled();
    });

    it('no mira el token aunque llegue (ni uno inválido lo cierra)', async () => {
      await http().get('/plain/open').set(as('basura')).expect(200);
      await http()
        .get('/plain/open')
        .set('Authorization', 'esto no es un token')
        .expect(200);
      expect(verify).not.toHaveBeenCalled();
    });

    it('en la clase abre todas sus rutas', async () => {
      await http().get('/pub').expect(200);
    });

    it('un @Roles en una ruta de una clase pública la vuelve a cerrar: gana lo más específico', async () => {
      await http().get('/pub/admin').expect(401);
      await http().get('/pub/admin').set(as('ana')).expect(403);
      await http().get('/pub/admin').set(as('admin')).expect(200);
    });

    it('un @Public en una ruta de una clase con @Roles la abre', async () => {
      await http().get('/adm/open').expect(200);
    });

    it('@Public y @Roles juntos en la misma ruta: gana @Roles', async () => {
      await http().get('/both').expect(401);
      await http().get('/both').set(as('ana')).expect(403);
      await http().get('/both').set(as('admin')).expect(200);
    });
  });

  describe('@Roles()', () => {
    it('sin token da 401, no 403: primero se identifica', async () => {
      await http().get('/plain/admin').expect(401);
    });

    it('con otro rol da 403 FORBIDDEN y no ejecuta la ruta', async () => {
      const res = await http().get('/plain/admin').set(as('ana')).expect(403);

      expect(res.body).toEqual({
        statusCode: 403,
        errorCode: 'FORBIDDEN',
        message: expect.any(String),
      });
      expect(res.headers['www-authenticate']).toBeUndefined();
    });

    it('con el rol pedido entra y la ruta ve al usuario', async () => {
      const res = await http().get('/plain/admin').set(as('admin')).expect(200);
      expect(res.body).toEqual({ user: ADMIN });
    });

    it('acepta cualquiera de varios roles', async () => {
      await http().get('/plain/either').set(as('ana')).expect(200);
      await http().get('/plain/either').set(as('admin')).expect(200);
    });

    it('un rol que no existe no entra (aunque el verificador lo devuelva)', async () => {
      await http().get('/plain/admin').set(as('rol-raro')).expect(403);
      await http().get('/plain/either').set(as('rol-raro')).expect(403);
    });

    it('en la clase aplica a todas sus rutas, y el de la ruta lo reemplaza', async () => {
      await http().get('/adm').set(as('ana')).expect(403);
      await http().get('/adm').set(as('admin')).expect(200);
      await http().get('/adm/buyer').set(as('ana')).expect(200);
      await http().get('/adm/buyer').set(as('admin')).expect(403);
    });
  });

  describe('el encabezado Authorization', () => {
    it.each([
      ['falta', undefined],
      ['está vacío', ''],
      ['es solo la palabra Bearer', 'Bearer'],
      ['es Bearer con un espacio y nada más', 'Bearer '],
      ['usa otro esquema', 'Basic YW5hOnNlY3JldG8='],
      ['trae dos tokens', 'Bearer ana admin'],
      ['trae el token con espacios de más', 'Bearer  ana'],
      ['trae el token sin el esquema', 'ana'],
      ['trae el esquema precedido de otra palabra', 'Basic Bearer ana'],
      ['trae el esquema pegado a otra palabra', 'XBearer ana'],
      ['trae un token con caracteres que no valen', 'Bearer a"na'],
    ])('%s: 401 UNAUTHENTICATED', async (_why, header) => {
      const req = http().get('/plain');
      const res = await (
        header === undefined ? req : req.set('Authorization', header)
      ).expect(401);

      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
      expect(verify).not.toHaveBeenCalled();
    });

    it.each(['Bearer ana', 'bearer ana', 'BEARER ana', 'BeArEr ana'])(
      'el esquema no distingue mayúsculas (%j)',
      async (header) => {
        await http().get('/plain').set('Authorization', header).expect(200);
        expect(verify).toHaveBeenCalledWith('ana');
      },
    );

    // Node recorta los espacios del final de un encabezado, así que estos casos solo se pueden comprobar llamando al guard
    it.each([
      ['un espacio al final', 'Bearer ana '],
      ['un salto de línea al final', 'Bearer ana\n'],
      ['una tabulación dentro', 'Bearer a\tna'],
      ['una tabulación como separador', 'Bearer\tana'],
    ])('el guard rechaza %s', async (_why, header) => {
      const guard = new AuthGuard(new Reflector(), { verify } as never);
      const req = {
        headers: { authorization: header },
        method: 'GET',
        path: '/x',
      };
      const res = { setHeader: vi.fn() };
      const context = {
        getHandler: () => () => undefined,
        getClass: () => PlainController,
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      };

      await expect(guard.canActivate(context as never)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
      expect(verify).not.toHaveBeenCalled();
    });

    it('el token solo viaja en el encabezado: ni la URL ni el cuerpo ni una cookie lo reemplazan', async () => {
      await http().get('/plain?access_token=ana').expect(401);
      await http().get('/plain').set('Cookie', 'token=ana').expect(401);
      await http().get('/plain').send({ accessToken: 'ana' }).expect(401);
    });
  });

  describe('un token que no sirve', () => {
    it('inválido: 401 UNAUTHENTICATED, el mismo mensaje que cuando falta', async () => {
      const missing = await http().get('/plain').expect(401);
      const invalid = await http().get('/plain').set(as('falso')).expect(401);

      expect(invalid.body).toEqual(missing.body);
      expect(invalid.headers['www-authenticate']).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it('vencido: 401 TOKEN_EXPIRED, para que el cliente renueve la sesión', async () => {
      const res = await http().get('/plain').set(as('vencido')).expect(401);

      expect(res.body).toEqual({
        statusCode: 401,
        errorCode: 'TOKEN_EXPIRED',
        message: expect.any(String),
      });
      expect(res.headers['www-authenticate']).toBe(
        'Bearer error="invalid_token"',
      );
    });

    it('el mensaje no repite el token', async () => {
      const res = await http().get('/plain').set(as('falso')).expect(401);
      expect(res.text).not.toContain('falso');
    });

    it('un error inesperado del verificador no deja pasar: 500, nunca 200', async () => {
      verify.mockRejectedValueOnce(new Error('se cayó'));
      const res = await http().get('/plain').set(as('ana'));
      expect(res.status).toBe(500);
    });
  });

  describe('el usuario autenticado', () => {
    it('@CurrentUser() entrega el id y el rol del token, nada más', async () => {
      const res = await http().get('/plain').set(as('ana')).expect(200);
      expect(Object.keys(res.body.user).sort()).toEqual(['role', 'userId']);
    });

    it('en una ruta pública no hay usuario, aunque se mande un token', async () => {
      const res = await http().get('/plain/open').set(as('ana')).expect(200);
      expect(res.body.user).toBeNull();
    });

    it('verifica el token una sola vez por petición', async () => {
      await http().get('/plain/admin').set(as('admin')).expect(200);
      expect(verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('lo que queda en el log', () => {
    const capture = () => {
      const seen: { message: string; requestId?: string }[] = [];
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message: unknown) => {
          seen.push({
            message: String(message),
            requestId: RequestContext.requestId(),
          });
        });
      return { seen, restore: () => warn.mockRestore() };
    };

    it('un acceso denegado deja un aviso con el requestId de la petición, la ruta y el motivo', async () => {
      const log = capture();
      try {
        await http()
          .get('/plain/admin?customerId=secreto')
          .set('X-Request-Id', 'r-401')
          .expect(401);
        await http()
          .get('/plain/admin')
          .set(as('ana'))
          .set('X-Request-Id', 'r-403')
          .expect(403);
      } finally {
        log.restore();
      }

      expect(log.seen).toHaveLength(2);
      expect(log.seen[0].requestId).toBe('r-401');
      expect(log.seen[0].message).toContain('401');
      expect(log.seen[0].message).toContain('GET /plain/admin');
      expect(log.seen[0].message).toContain('UNAUTHENTICATED');
      expect(log.seen[1].requestId).toBe('r-403');
      expect(log.seen[1].message).toContain('403');
      expect(log.seen[1].message).toContain(ANA.userId);
    });

    it('el aviso no lleva el token ni la query de la URL', async () => {
      const log = capture();
      try {
        await http()
          .get('/plain?token=otro-secreto')
          .set(as('falso-secreto'))
          .expect(401);
        await http().get('/plain').set(as('vencido')).expect(401);
      } finally {
        log.restore();
      }

      const text = JSON.stringify(log.seen);
      expect(text).not.toContain('falso-secreto');
      expect(text).not.toContain('otro-secreto');
      expect(log.seen.some((l) => l.message.includes('TOKEN_EXPIRED'))).toBe(
        true,
      );
    });

    it('un acceso permitido o una ruta pública no avisan', async () => {
      const log = capture();
      try {
        await http().get('/plain').set(as('ana')).expect(200);
        await http().get('/plain/open').expect(200);
      } finally {
        log.restore();
      }
      expect(log.seen).toEqual([]);
    });
  });
});
