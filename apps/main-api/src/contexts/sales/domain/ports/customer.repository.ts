import type { TransactionHandle } from '../../../../shared-kernel/transaction-handle.js';
import type { Customer } from '../customer/customer.aggregate.js';

export abstract class CustomerRepository {
  // `tx` es la transacción de quien llama (el relay del Outbox), si la hay: así lee y escribe dentro de ella
  abstract findById(
    id: string,
    tx?: TransactionHandle,
  ): Promise<Customer | null>;

  abstract add(customer: Customer, tx?: TransactionHandle): Promise<void>;
}
