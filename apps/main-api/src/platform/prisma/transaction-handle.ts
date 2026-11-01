import type { TransactionHandle } from '../../shared-kernel/transaction-handle.js';
import type { Prisma } from './generated/client.js';

const KEY = Symbol('prisma.transaction');

// Envuelve la transacción de Prisma que otro abrió (el relay del Outbox) en un identificador opaco, para pasarla por
// los comandos y los puertos sin que `domain/` ni `application/` conozcan Prisma. No deja ver la transacción: la clave es
// un símbolo, así que no sale al serializarlo ni al enumerarlo
export function toTransactionHandle(
  tx: Prisma.TransactionClient,
): TransactionHandle {
  return Object.freeze({ [KEY]: tx }) as unknown as TransactionHandle;
}

// Lo contrario, para los adaptadores de Prisma. Sin identificador no hay transacción; un valor que no sea uno de los
// nuestros se rechaza en vez de usarse a ciegas
export function fromTransactionHandle(
  handle: TransactionHandle | undefined,
): Prisma.TransactionClient | undefined {
  if (handle === undefined) return undefined;
  const tx =
    typeof handle === 'object' && handle !== null
      ? (handle as unknown as Record<symbol, unknown>)[KEY]
      : undefined;
  if (!tx) {
    throw new Error(
      'El identificador recibido no es una transacción de Prisma',
    );
  }
  return tx as Prisma.TransactionClient;
}
