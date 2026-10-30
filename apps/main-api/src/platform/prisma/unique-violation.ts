import { Prisma } from './generated/client.js';

// Prisma avisa con el código P2002 de que una escritura chocó con una restricción única (un correo, un ISBN, una clave
// de idempotencia…). Es la forma de resolver una carrera sin mirar antes de insertar
export function isUniqueViolation(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
