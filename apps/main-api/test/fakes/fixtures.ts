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

// Una dirección de entrega válida, para los tests que arman pedidos
export const ADDRESS_DATA = {
  recipient: 'Ana Pérez',
  phone: '+51 999 888 777',
  line1: 'Av. Larco 123, Dpto 401',
  district: 'Miraflores',
  province: 'Lima',
  department: 'Lima',
  reference: 'Frente al parque Kennedy',
} as const;
