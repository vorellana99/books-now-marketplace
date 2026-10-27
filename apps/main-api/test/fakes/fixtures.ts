import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { FixedCatalog } from './fixed-catalog.js';
import { InMemoryCustomerRepository } from './in-memory-customer-repository.js';

export const ISBN = '9780306406157';
export const CUSTOMER_ID = 'c-1';

// Un libro a S/ 100.00
export const fixedCatalog = () =>
  new FixedCatalog({ [ISBN]: { title: 'Clean Code', price: '100.00' } });

export const customersWithPremium = () =>
  new InMemoryCustomerRepository([
    Customer.create(CUSTOMER_ID, 'ana@example.com', true),
  ]);

export const customersWithNormal = () =>
  new InMemoryCustomerRepository([
    Customer.create(CUSTOMER_ID, 'ana@example.com'),
  ]);
