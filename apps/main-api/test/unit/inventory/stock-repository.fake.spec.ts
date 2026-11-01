import type { TransactionHandle } from '../../../src/shared-kernel/transaction-handle.js';
import { InMemoryStockRepository } from '../../fakes/in-memory-stock-repository.js';
import { stockRepositoryContract } from '../../support/stock-repository.contract.js';

stockRepositoryContract('fake en memoria', () => {
  const repo = new InMemoryStockRepository();
  return Promise.resolve({
    repo,
    seed: (isbn, available, reserved = 0) =>
      Promise.resolve(repo.seed(isbn, available, reserved)),
    levelOf: (isbn) => Promise.resolve(repo.levelOf(isbn)),
    reservationsOf: (orderId) => Promise.resolve(repo.reservationsOf(orderId)),
    ageReservations: (orderId, days) =>
      Promise.resolve(repo.ageReservations(orderId, days)),
    // el fake no tiene transacciones reales: guarda el estado y lo restaura si `fn` falla
    withTransaction: async (fn: (tx: TransactionHandle) => Promise<void>) => {
      const snapshot = repo.snapshot();
      try {
        await fn({} as TransactionHandle);
      } catch (error) {
        repo.restore(snapshot);
        throw error;
      }
    },
  });
});
