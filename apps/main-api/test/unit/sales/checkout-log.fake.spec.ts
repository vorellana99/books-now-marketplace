import { InMemoryCheckoutLog } from '../../fakes/in-memory-checkout-log.js';
import { checkoutLogContract } from '../../support/checkout-log.contract.js';

// El fake en memoria cumple el mismo contrato que la implementación con Prisma
checkoutLogContract('fake en memoria', async () => {
  const log = new InMemoryCheckoutLog();
  return {
    log,
    complete: async (orderId, charged) => log.complete(orderId, charged),
    backdate: async (orderId, minutes) => log.backdate(orderId, minutes),
    expireLock: async (orderId) => log.expireLock(orderId),
    statusOf: async (orderId) => log.statusOf(orderId),
  };
});
