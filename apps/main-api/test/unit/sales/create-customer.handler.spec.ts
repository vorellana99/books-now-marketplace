import { randomUUID } from 'node:crypto';
import { CreateCustomerCommand } from '../../../src/contexts/sales/application/customer/create-customer.command.js';
import { CreateCustomerHandler } from '../../../src/contexts/sales/application/customer/create-customer.handler.js';
import { Customer } from '../../../src/contexts/sales/domain/customer/customer.aggregate.js';
import type { TransactionHandle } from '../../../src/shared-kernel/transaction-handle.js';
import { InMemoryCustomerRepository } from '../../fakes/in-memory-customer-repository.js';

const failure = (fn: () => Promise<unknown>) =>
  fn().then(
    () => undefined,
    (e: unknown) => e as Error,
  );

describe('CreateCustomerHandler (el cliente de cada comprador)', () => {
  const setup = (existing: Customer[] = []) => {
    const customers = new InMemoryCustomerRepository(existing);
    const run = (userId: string, email: string, role: string) =>
      new CreateCustomerHandler(customers).execute(
        new CreateCustomerCommand(userId, email, role),
      );
    return { customers, run };
  };

  it('crea el cliente con el mismo id que el usuario, el correo normalizado y no premium', async () => {
    const { customers, run } = setup();
    const id = randomUUID();

    await run(id, ' Ana@Example.COM ', 'BUYER');

    expect(customers.all()).toHaveLength(1);
    expect(customers.all()[0]).toMatchObject({
      id,
      isPremium: false,
      email: { value: 'ana@example.com' },
    });
  });

  it('un administrador no es un cliente: no se crea nada', async () => {
    const { customers, run } = setup();

    await run(randomUUID(), 'root@example.com', 'ADMIN');

    expect(customers.all()).toEqual([]);
  });

  it('repetir el mismo id y correo no toca al cliente (conserva su premium)', async () => {
    const id = randomUUID();
    const premium = Customer.create(id, 'ana@example.com', true);
    const { customers, run } = setup([premium]);

    await run(id, 'ana@example.com', 'BUYER');

    expect(customers.all()).toEqual([premium]);
    expect(customers.all()[0].isPremium).toBe(true);
  });

  it('el mismo id con otro correo es un error y no cambia al cliente', async () => {
    const id = randomUUID();
    const existing = Customer.create(id, 'ana@example.com');
    const { customers, run } = setup([existing]);

    const error = await failure(() => run(id, 'otro@example.com', 'BUYER'));

    expect(error?.message).toMatch(/ya existe con otro correo/);
    expect(customers.all()).toEqual([existing]);
  });

  it('un rol desconocido es un error: no se adivina qué hacer', async () => {
    const { customers, run } = setup();

    const error = await failure(() =>
      run(randomUUID(), 'ana@example.com', 'SUPERUSER'),
    );

    expect(error?.message).toMatch(/Rol desconocido/);
    expect(customers.all()).toEqual([]);
  });

  it.each(['no-es-uuid', '', 'x'.repeat(40)])(
    'un id que no es un UUID (%j) es un error',
    async (id) => {
      const { customers, run } = setup();

      const error = await failure(() => run(id, 'ana@example.com', 'BUYER'));

      expect(error?.message).toMatch(/no es un UUID/);
      expect(customers.all()).toEqual([]);
    },
  );

  it.each(['sin-arroba', '', 'a@b'])(
    'un correo inválido (%j) es un error y no crea nada',
    async (email) => {
      const { customers, run } = setup();

      const error = await failure(() => run(randomUUID(), email, 'BUYER'));

      expect(error).toBeDefined();
      expect(customers.all()).toEqual([]);
    },
  );

  it('pasa la transacción del comando al repositorio, al leer y al guardar', async () => {
    const { customers } = setup();
    const tx = Object.freeze({}) as TransactionHandle;

    await new CreateCustomerHandler(customers).execute(
      new CreateCustomerCommand(randomUUID(), 'ana@example.com', 'BUYER', tx),
    );

    expect(customers.transactions).toEqual([tx, tx]);
  });
});
