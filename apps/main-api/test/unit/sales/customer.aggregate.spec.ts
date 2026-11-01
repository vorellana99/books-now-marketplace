import { Customer } from '../../../src/contexts/sales/domain/model/customer/customer.aggregate.js';
import { Email } from '../../../src/contexts/sales/domain/model/customer/email.vo.js';
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

// Tarea 10.16: las reglas de «un comprador registrado es un cliente» eran del handler y ahora son del agregado
describe('Customer.fromRegisteredUser', () => {
  const ID = '0196a000-0000-7000-8000-0000000000aa';
  const registered = (
    role: string,
    userId = ID,
    email = 'ana@example.com',
  ) => ({
    userId,
    email,
    role,
  });
  const failure = (fn: () => unknown): Error | undefined => {
    try {
      fn();
    } catch (e) {
      return e as Error;
    }
  };

  it('un comprador es un cliente con el mismo id, el correo normalizado y no premium', () => {
    const customer = Customer.fromRegisteredUser(
      registered('BUYER', ID, ' Ana@Example.COM '),
    );

    expect(customer).toMatchObject({
      id: ID,
      isPremium: false,
      email: { value: 'ana@example.com' },
    });
  });

  it('un administrador no es un cliente: no hay nada que crear', () => {
    expect(Customer.fromRegisteredUser(registered('ADMIN'))).toBeNull();
  });

  it.each(['SUPERUSER', 'buyer', '', 'admin'])(
    'un rol desconocido (%j) es un error: no se adivina qué hacer',
    (role) => {
      expect(
        failure(() => Customer.fromRegisteredUser(registered(role)))?.message,
      ).toMatch(/Rol desconocido/);
    },
  );

  it.each(['no-es-uuid', '', 'x'.repeat(40)])(
    'un id que no es un UUID (%j) es un error',
    (userId) => {
      expect(
        failure(() => Customer.fromRegisteredUser(registered('BUYER', userId)))
          ?.message,
      ).toMatch(/no es un UUID/);
    },
  );

  it('un objeto que se convierte en un UUID tampoco es un id: tiene que ser texto', () => {
    const lookalike = { toString: () => ID } as never;
    expect(
      failure(() => Customer.fromRegisteredUser(registered('BUYER', lookalike)))
        ?.message,
    ).toMatch(/no es un UUID/);
  });

  it('un id que no es texto es un error', () => {
    expect(
      failure(() =>
        Customer.fromRegisteredUser(registered('BUYER', 42 as never)),
      )?.message,
    ).toMatch(/no es un UUID/);
  });

  it.each(['sin-arroba', '', 'a@b'])(
    'un correo inválido (%j) es un error de dominio',
    (email) => {
      expect(
        failure(() =>
          Customer.fromRegisteredUser(registered('BUYER', ID, email)),
        ),
      ).toBeInstanceOf(DomainError);
    },
  );

  describe('assertSameEmailAs: repetir la entrega no hace daño, pero lo que no cuadra es un error', () => {
    it('el mismo correo (aunque cambien mayúsculas) no es un error', () => {
      const existing = Customer.create(ID, 'ana@example.com', true);
      const again = Customer.fromRegisteredUser(
        registered('BUYER', ID, 'ANA@example.com'),
      ) as Customer;

      expect(() => existing.assertSameEmailAs(again)).not.toThrow();
    });

    it('otro correo para el mismo id es un error que nombra al cliente', () => {
      const existing = Customer.create(ID, 'ana@example.com');
      const other = Customer.fromRegisteredUser(
        registered('BUYER', ID, 'otro@example.com'),
      ) as Customer;

      expect(failure(() => existing.assertSameEmailAs(other))?.message).toBe(
        `El cliente ${ID} ya existe con otro correo`,
      );
    });
  });
});
