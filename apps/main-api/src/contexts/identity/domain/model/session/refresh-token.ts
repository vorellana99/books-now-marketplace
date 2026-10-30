import { createHash, randomBytes } from 'node:crypto';

const WELL_FORMED = /^[A-Za-z0-9_-]{43}$/; // 32 bytes en base64url, sin relleno

// SHA-256 y no scrypt: el token ya es aleatorio y de 256 bits, no hay nada que adivinar y se comprueba en cada
// renovación. En la base solo queda este hash: quien lea la tabla no puede usar los tokens
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

// Un token de refresco: 32 bytes aleatorios, opaco (no lleva datos del usuario)
export function generateRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

// Descarta lo que no puede ser un token nuestro sin ir a la base
export const isWellFormedRefreshToken = (token: unknown): token is string =>
  typeof token === 'string' && WELL_FORMED.test(token);
