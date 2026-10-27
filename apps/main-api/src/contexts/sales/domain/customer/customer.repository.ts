import type { Customer } from './customer.aggregate.js';

export abstract class CustomerRepository {
  abstract findById(id: string): Promise<Customer | null>;
}
