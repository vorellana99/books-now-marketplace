import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Customer } from '../../../domain/customer/customer.aggregate.js';
import { CustomerRepository } from '../../../domain/ports/customer.repository.js';
import { CreateCustomerCommand } from './create-customer.command.js';

// Reacciona a un comprador recién registrado. Las reglas (un administrador no es cliente, rol o id que no cuadran,
// mismo id con otro correo) son del agregado `Customer`; aquí solo se orquesta. Repetir la entrega no hace daño: si el
// cliente ya existe (mismo id y correo) no se toca, así que no se pisa un `premium` que ya se le haya dado
@CommandHandler(CreateCustomerCommand)
export class CreateCustomerHandler implements ICommandHandler<CreateCustomerCommand> {
  constructor(private readonly customers: CustomerRepository) {}

  async execute({
    userId,
    email,
    role,
    tx,
  }: CreateCustomerCommand): Promise<void> {
    const customer = Customer.fromRegisteredUser({ userId, email, role });
    if (!customer) return;

    const existing = await this.customers.findById(userId, tx);
    if (existing) {
      existing.assertSameEmailAs(customer);
      return;
    }
    await this.customers.add(customer, tx);
  }
}
