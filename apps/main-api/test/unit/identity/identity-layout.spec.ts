import { existsSync, readdirSync } from 'node:fs';

const BASE = 'src/contexts/identity';
const list = (dir: string) =>
  existsSync(`${BASE}/${dir}`)
    ? readdirSync(`${BASE}/${dir}`, { withFileTypes: true })
    : [];
const files = (dir: string) =>
  list(dir)
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

// Identidad sigue la misma arquitectura que Ventas (tarea 10.4): los casos de uso en application, los puertos en
// domain/ports y la infraestructura repartida por lo que hace cada pieza
describe('estructura de contexts/identity', () => {
  it('infrastructure/ solo tiene las carpetas adapters, http y persistence, y ningún archivo suelto', () => {
    const folders = list('infrastructure')
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b));
    expect(folders).toEqual(['adapters', 'http', 'persistence']);
    expect(files('infrastructure')).toEqual([]);
  });

  it('http/ tiene el controlador, los DTO, las respuestas y el guard del límite de intentos', () => {
    expect(files('infrastructure/http')).toEqual(
      [
        'auth-throttler.ts',
        'auth.controller.ts',
        'auth.dto.ts',
        'auth.responses.ts',
      ].sort(),
    );
  });

  it('persistence/ tiene los repositorios de Prisma', () => {
    expect(files('infrastructure/persistence')).toEqual([
      'prisma-session.repository.ts',
      'prisma-user.repository.ts',
    ]);
  });

  it('adapters/ tiene el JWT y el hash de contraseñas', () => {
    expect(files('infrastructure/adapters')).toEqual([
      'jwt-token.service.ts',
      'scrypt-password-hasher.ts',
    ]);
  });

  it('los casos de uso viven en application/use-cases, uno por agregado (tarea 10.16)', () => {
    expect(files('application/use-cases/session')).toEqual(
      expect.arrayContaining([
        'login.handler.ts',
        'logout.handler.ts',
        'refresh-session.handler.ts',
      ]),
    );
    expect(files('application/use-cases/user')).toEqual(
      expect.arrayContaining([
        'register-user.command.ts',
        'register-user.handler.ts',
      ]),
    );
  });

  it('los servicios y la purga viven en application/services y application/jobs; el puerto del token en el dominio', () => {
    expect(files('application/services')).toEqual([
      'create-admin.ts',
      'session.service.ts',
      'session.ts',
    ]);
    expect(files('application/jobs')).toEqual(['purge-refresh-tokens.job.ts']);
    expect(files('domain/ports')).toContain('access-token-issuer.ts');
    expect(files('application')).toEqual([]);
  });

  it('ningún handler vive en infrastructure/', () => {
    const handlers = ['adapters', 'http', 'persistence'].flatMap((dir) =>
      files(`infrastructure/${dir}`).filter((f) => f.endsWith('.handler.ts')),
    );
    expect(handlers).toEqual([]);
  });

  it('domain/ports/ tiene los cuatro puertos', () => {
    expect(files('domain/ports')).toEqual([
      'access-token-issuer.ts',
      'password-hasher.port.ts',
      'session.repository.ts',
      'user.repository.ts',
    ]);
  });
});
