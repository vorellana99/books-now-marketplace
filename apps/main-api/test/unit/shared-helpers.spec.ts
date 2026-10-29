import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Controller, Get } from '@nestjs/common';
import { ApiAuthErrors } from '../../src/platform/http/api-auth-errors.decorator.js';
import { isUniqueViolation } from '../../src/platform/prisma/unique-violation.js';
import { Prisma } from '../../src/platform/prisma/generated/client.js';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}
const SRC = sourceFiles('src');
const textOf = (file: string) => readFileSync(file, 'utf8');

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('x', {
    code,
    clientVersion: 'test',
  });

describe('isUniqueViolation', () => {
  it('es verdadero para el error P2002 de Prisma (violación de una restricción única)', () => {
    expect(isUniqueViolation(prismaError('P2002'))).toBe(true);
  });

  it('es falso para cualquier otro código de Prisma', () => {
    expect(isUniqueViolation(prismaError('P2003'))).toBe(false);
    expect(isUniqueViolation(prismaError('P2025'))).toBe(false);
  });

  it('es falso para un Error cualquiera, para un objeto con ese código y para lo que no es un error', () => {
    expect(isUniqueViolation(new Error('P2002'))).toBe(false);
    expect(isUniqueViolation({ code: 'P2002' })).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });

  it('la comprobación del código P2002 vive solo en el ayudante', () => {
    const using = SRC.filter(
      (f) =>
        textOf(f).includes("'P2002'") &&
        !f.endsWith('platform/prisma/unique-violation.ts'),
    );
    expect(using).toEqual([]);
  });
});

describe('ApiAuthErrors', () => {
  const responsesOf = (forbidden?: string) => {
    class Probe {
      @ApiAuthErrors(forbidden)
      @Get()
      route() {
        return null;
      }
    }
    Controller('probe')(Probe);
    return Reflect.getMetadata(
      'swagger/apiResponse', // DECORATORS.API_RESPONSE, que @nestjs/swagger no exporta
      Object.getOwnPropertyDescriptor(Probe.prototype, 'route')?.value,
    ) as Record<string, { description: string }>;
  };

  it('documenta el 401 con los dos códigos de acceso', () => {
    expect(responsesOf()[401]?.description).toBe(
      'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
    );
  });

  it('con un texto de 403, documenta también el 403', () => {
    const responses = responsesOf('FORBIDDEN: solo los administradores');
    expect(responses[403]?.description).toBe(
      'FORBIDDEN: solo los administradores',
    );
    expect(responses[401]).toBeDefined();
  });

  it('sin texto de 403, no documenta ninguno', () => {
    expect(responsesOf()[403]).toBeUndefined();
  });

  it('ningún controlador repite a mano la descripción del 401 de acceso', () => {
    const repeated = SRC.filter(
      (f) =>
        textOf(f).includes('UNAUTHENTICATED o TOKEN_EXPIRED') &&
        !f.endsWith('platform/http/api-auth-errors.decorator.ts'),
    );
    expect(repeated).toEqual([]);
  });
});

describe('validación de UUID', () => {
  it('los controladores validan los UUID solo con ParseUUIDPipe, no con isUUID a mano', () => {
    const controllers = SRC.filter((f) => f.endsWith('.controller.ts'));
    const manual = controllers.filter((f) => /\bisUUID\b/.test(textOf(f)));
    expect(manual).toEqual([]);
  });
});
