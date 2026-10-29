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

  it('los handlers, el servicio de sesión y la purga viven en application/', () => {
    expect(files('application')).toEqual(
      expect.arrayContaining([
        'login.handler.ts',
        'logout.handler.ts',
        'refresh-session.handler.ts',
        'register-user.handler.ts',
        'session.service.ts',
        'purge-refresh-tokens.job.ts',
        'create-admin.ts',
      ]),
    );
  });

  it('ningún handler vive en infrastructure/', () => {
    const handlers = ['adapters', 'http', 'persistence'].flatMap((dir) =>
      files(`infrastructure/${dir}`).filter((f) => f.endsWith('.handler.ts')),
    );
    expect(handlers).toEqual([]);
  });

  it('domain/ports/ tiene los tres puertos', () => {
    expect(files('domain/ports')).toEqual([
      'password-hasher.port.ts',
      'session.repository.ts',
      'user.repository.ts',
    ]);
  });
});
