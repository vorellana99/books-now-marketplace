import type { Prisma } from '../../../src/platform/prisma/generated/client.js';
import {
  fromTransactionHandle,
  toTransactionHandle,
} from '../../../src/platform/prisma/transaction-handle.js';
import type { TransactionHandle } from '../../../src/shared-kernel/transaction-handle.js';

const fakeTx = { reservation: {} } as unknown as Prisma.TransactionClient;

describe('TransactionHandle (identificador opaco de una transacción de Prisma)', () => {
  it('la ida y la vuelta devuelven la misma transacción', () => {
    expect(fromTransactionHandle(toTransactionHandle(fakeTx))).toBe(fakeTx);
  });

  it('sin identificador no hay transacción: undefined', () => {
    expect(fromTransactionHandle(undefined)).toBeUndefined();
  });

  it('un valor que no es un identificador se rechaza, no se usa a ciegas', () => {
    for (const foreign of [{}, { tx: fakeTx }, 'tx', 7, null]) {
      expect(() =>
        fromTransactionHandle(foreign as unknown as TransactionHandle),
      ).toThrow(/no es una transacción/);
    }
  });

  it('el identificador no deja ver la transacción: al serializarse no lleva nada', () => {
    const handle = toTransactionHandle(fakeTx);

    expect(JSON.stringify(handle)).toBe('{}');
    expect(Object.keys(handle)).toEqual([]);
  });

  it('el identificador no se puede alterar', () => {
    const handle = toTransactionHandle(fakeTx);

    expect(Object.isFrozen(handle)).toBe(true);
  });

  it('dos transacciones distintas dan dos identificadores que no se confunden', () => {
    const other = { other: true } as unknown as Prisma.TransactionClient;

    expect(fromTransactionHandle(toTransactionHandle(other))).toBe(other);
    expect(fromTransactionHandle(toTransactionHandle(fakeTx))).not.toBe(other);
  });
});
