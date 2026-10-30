import type { Customer } from '../../src/contexts/sales/domain/model/customer/customer.aggregate.js';
import { CustomerRepository } from '../../src/contexts/sales/domain/ports/customer.repository.js';
import type { TransactionHandle } from '../../src/shared-kernel/transaction-handle.js';

export class InMemoryCustomerRepository extends CustomerRepository {
  private readonly byId: Map<string, Customer>;
  // La transacción con la que se llamó cada vez, para comprobar que el caso de uso la pasa
  readonly transactions: (TransactionHandle | undefined)[] = [];

  constructor(customers: Customer[] = []) {
    super();
    this.byId = new Map(customers.map((c) => [c.id, c]));
  }

  findById(id: string, tx?: TransactionHandle): Promise<Customer | null> {
    this.transactions.push(tx);
    return Promise.resolve(this.byId.get(id) ?? null);
  }

  add(customer: Customer, tx?: TransactionHandle): Promise<void> {
    this.transactions.push(tx);
    this.byId.set(customer.id, customer);
    return Promise.resolve();
  }

  all(): Customer[] {
    return [...this.byId.values()];
  }
}
