import { InMemoryOrderHistory } from '../../fakes/in-memory-order-history.js';
import { orderHistoryContract } from '../../support/order-history.contract.js';

orderHistoryContract('fake en memoria', () => {
  const history = new InMemoryOrderHistory();
  return Promise.resolve({
    history,
    seed: (order) => Promise.resolve(history.seed(order)),
  });
});
