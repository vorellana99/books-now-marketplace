import type { DomainEvent } from '../../shared-kernel/domain-event.js';
import type { Role } from '../../shared-kernel/role.js';

// Se registró un usuario. Ventas reacciona creando a su cliente con el mismo id. Lleva el correo porque el cliente lo
// necesita; nunca la contraseña ni su hash. Viaja como JSON
export class UserRegisteredEvent implements DomainEvent {
  readonly eventName = 'identity.user.registered';
  readonly eventVersion = 1;
  readonly occurredOn = new Date();
  readonly aggregateId: string; // propiedad real (no getter), para que también viaje en el payload JSON

  constructor(
    readonly userId: string,
    readonly email: string,
    readonly role: Role,
  ) {
    this.aggregateId = userId;
  }
}
