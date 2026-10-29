import { Customer } from '../../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { Email } from '../../../src/contexts/sales/domain/customer/email.vo.js';
import { DomainError } from '../../../src/shared-kernel/domain.errors.js';

describe('Customer', () => {
  it('por defecto no es premium', () => {
    const customer = Customer.create('c-1', 'ana@example.com');
    expect(customer.id).toBe('c-1');
    expect(customer.isPremium).toBe(false);
  });

  it('puede crearse premium', () => {
    expect(Customer.create('c-1', 'ana@example.com', true).isPremium).toBe(
      true,
    );
  });

  it('guarda el correo como value object normalizado', () => {
    const customer = Customer.create('c-1', ' Ana@Example.COM ');
    expect(customer.email).toBeInstanceOf(Email);
    expect(customer.email.value).toBe('ana@example.com');
  });

  it('rechaza un correo inválido', () => {
    expect(() => Customer.create('c-1', 'no-es-un-correo')).toThrow(
      DomainError,
    );
    expect(() => Customer.create('c-1', 'no-es-un-correo')).toThrow(/correo/i);
  });
});
