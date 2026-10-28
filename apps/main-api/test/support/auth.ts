import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AccessTokenIssuer } from '../../src/contexts/identity/application/access-token-issuer.js';
import type { Role } from '../../src/shared-kernel/role.js';

// Un token de acceso válido para un usuario (existente o no: el token no consulta la base), emitido por el mismo
// servicio que firma los de la aplicación
export async function accessTokenFor(
  app: INestApplication,
  role: Role = 'BUYER',
  userId: string = randomUUID(),
): Promise<string> {
  const { token } = await app
    .get(AccessTokenIssuer)
    .issue({ id: userId, role });
  return token;
}

// El encabezado de una petición autenticada: `.set(await bearer(app, 'ADMIN'))`
export async function bearer(
  app: INestApplication,
  role: Role = 'BUYER',
  userId?: string,
): Promise<{ Authorization: string }> {
  return { Authorization: `Bearer ${await accessTokenFor(app, role, userId)}` };
}
