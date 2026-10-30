import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Customer } from '../../domain/customer/customer.aggregate.js';
import { CustomerRepository } from '../../domain/ports/customer.repository.js';
import { CreateCustomerCommand } from './create-customer.command.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Todo comprador es un cliente de Ventas con el mismo id que su usuario, así no hace falta ninguna tabla que los ligue.
// Repetir la entrega no hace daño: si el cliente ya existe (mismo id y correo) no se toca, así que no se pisa un
// `premium` que ya se le haya dado. Lo que no cuadra es un error, no se omite: el relay lo reintenta y acaba en FAILED,
// a la vista del monitoreo (un correo que ya es de otro cliente, por ejemplo)
@CommandHandler(CreateCustomerCommand)
export class CreateCustomerHandler implements ICommandHandler<CreateCustomerCommand> {
  constructor(private readonly customers: CustomerRepository) {}

  async execute({
    userId,
    email,
    role,
    tx,
  }: CreateCustomerCommand): Promise<void> {
    // Un administrador no compra: no es un cliente
    if (role === 'ADMIN') return;
    if (role !== 'BUYER') {
      throw new Error(`Rol desconocido en identity.user.registered: ${role}`);
    }
    if (typeof userId !== 'string' || !UUID.test(userId)) {
      throw new Error(
        'El id del usuario de identity.user.registered no es un UUID',
      );
    }
    const customer = Customer.create(userId, email);

    const existing = await this.customers.findById(userId, tx);
    if (existing) {
      if (existing.email.value !== customer.email.value) {
        throw new Error(`El cliente ${userId} ya existe con otro correo`);
      }
      return;
    }
    await this.customers.add(customer, tx);
  }
}
