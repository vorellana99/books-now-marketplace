import { Injectable } from '@nestjs/common';
import type { UserRegisteredEvent } from '../../../../contracts/identity/user-registered.event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
} from '../../../../platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../../../platform/outbox/outbox-handler.decorator.js';
import { Email } from '../../domain/customer/email.vo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reacciona a identity.user.registered: todo comprador es un cliente de Ventas con el mismo id que su usuario, así no
// hace falta ninguna tabla que los ligue. Identidad no toca las tablas de Ventas; se hablan por el evento. Usa el tx del
// relay, así el cliente y la marca DONE se confirman juntos.
// Repetir la entrega no hace daño: si el cliente ya existe (mismo id y correo) no se toca, así que no se pisa un
// `premium` que ya se le haya dado. Lo que no cuadra es un error, no se omite: el relay lo reintenta y acaba en FAILED,
// a la vista del monitoreo (un correo que ya es de otro cliente, por ejemplo)
@OutboxHandler()
@Injectable()
export class CreateCustomerConsumer implements DbOutboxConsumer<UserRegisteredEvent> {
  readonly kind = 'db' as const;
  readonly name = 'sales.create-customer';
  readonly event = 'identity.user.registered';

  async handle(
    e: UserRegisteredEvent,
    { tx }: DbDeliveryContext,
  ): Promise<void> {
    // Un administrador no compra: no es un cliente
    if (e.role === 'ADMIN') return;
    if (e.role !== 'BUYER') {
      throw new Error(
        `Rol desconocido en identity.user.registered: ${String(e.role)}`,
      );
    }
    if (typeof e.userId !== 'string' || !UUID.test(e.userId)) {
      throw new Error(
        'El id del usuario de identity.user.registered no es un UUID',
      );
    }
    const email = Email.create(e.email).value;

    const existing = await tx.customer.findUnique({ where: { id: e.userId } });
    if (existing) {
      if (existing.email !== email) {
        throw new Error(`El cliente ${e.userId} ya existe con otro correo`);
      }
      return;
    }
    await tx.customer.create({
      data: { id: e.userId, email, premium: false },
    });
  }
}
