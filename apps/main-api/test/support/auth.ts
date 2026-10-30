import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AccessTokenIssuer } from '../../src/contexts/identity/domain/ports/access-token-issuer.js';
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

export const TEST_PASSWORD = 'una contraseña larga y buena';

export interface TestSession {
  id: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  auth: { Authorization: string };
}

// Inicia sesión por la API, como lo haría un cliente de verdad (a diferencia de `bearer`, que firma un token sin pasar
// por la base). Falla si las credenciales no valen
export async function loginAs(
  app: INestApplication,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<TestSession> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password })
    .expect(200);
  return {
    id: res.body.user.id as string,
    email,
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
  };
}

// Se registra como comprador por la API e inicia sesión. Ventas crea a su cliente cuando el relay entrega el evento:
// los tests que compran deben dejar que corra (`relay.runOnce()`)
export async function signUp(
  app: INestApplication,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<TestSession> {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ email, password })
    .expect(201);
  return loginAs(app, email, password);
}
