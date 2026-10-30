import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { UserRegisteredEvent } from '../../../../contracts/identity/user-registered.event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';
import { toTransactionHandle } from '../../../../platform/prisma/transaction-handle.js';
import { CreateCustomerCommand } from '../../application/customer/create-customer.command.js';

// Reacciona a identity.user.registered: todo comprador es un cliente de Ventas. Identidad no toca las tablas de Ventas;
// se hablan por el evento. Es un adaptador de entrada fino: convierte la transacción del relay en un identificador
// opaco y envía el comando, así el cliente y la marca DONE se confirman juntos. Las reglas están en
// `CreateCustomerHandler`
@OutboxHandler()
@Injectable()
export class CreateCustomerConsumer implements DbOutboxConsumer<UserRegisteredEvent> {
  readonly kind = 'db' as const;
  readonly name = 'sales.create-customer';
  readonly event = 'identity.user.registered';

  constructor(private readonly commandBus: CommandBus) {}

  async handle(
    e: UserRegisteredEvent,
    { tx }: DbDeliveryContext,
  ): Promise<void> {
    await this.commandBus.execute(
      new CreateCustomerCommand(
        e.userId,
        e.email,
        e.role,
        toTransactionHandle(tx),
      ),
    );
  }
}
