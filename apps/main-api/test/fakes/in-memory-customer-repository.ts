import type { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { CustomerRepository } from '../../src/contexts/sales/domain/customer/customer.repository.js';

export class InMemoryCustomerRepository extends CustomerRepository {
  private readonly byId: Map<string, Customer>;

  constructor(customers: Customer[]) {
    super();
    this.byId = new Map(customers.map((c) => [c.id, c]));
  }

  findById(id: string): Promise<Customer | null> {
    return Promise.resolve(this.byId.get(id) ?? null);
  }
}
