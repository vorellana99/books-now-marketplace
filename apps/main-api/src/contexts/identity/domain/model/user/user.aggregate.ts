import { UserRegisteredEvent } from '../../../../../contracts/identity/user-registered.event.js';
import type { DomainEvent } from '../../../../../shared-kernel/domain-event.js';
import { DomainError } from '../../../../../shared-kernel/domain.errors.js';
import { ROLES, type Role } from '../../../../../shared-kernel/role.js';
import type { Email } from './email.vo.js';

export type { Role };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Quien puede iniciar sesión. Guarda el hash de la contraseña, nunca la contraseña, y no lo muestra al serializarse
export class User {
  private events: DomainEvent[] = [];

  private constructor(
    readonly id: string,
    readonly email: Email,
    readonly passwordHash: string,
    readonly role: Role,
  ) {}

  static create(data: {
    id: string;
    email: Email;
    passwordHash: string;
    role: Role;
  }): User {
    if (typeof data.id !== 'string' || !UUID.test(data.id)) {
      throw new DomainError(
        'INVALID_USER',
        'El id del usuario debe ser un UUID',
      );
    }
    if (
      typeof data.passwordHash !== 'string' ||
      data.passwordHash.trim() === ''
    ) {
      throw new DomainError(
        'INVALID_USER',
        'Un usuario no puede existir sin el hash de su contraseña',
      );
    }
    if (!ROLES.includes(data.role)) {
      throw new DomainError('INVALID_ROLE', 'El rol debe ser BUYER o ADMIN');
    }
    return new User(data.id, data.email, data.passwordHash, data.role);
  }

  // El alta de un comprador: siempre con el rol BUYER (el rol no se elige) y con su evento identity.user.registered, que
  // Ventas usa para crear a su cliente. Un administrador, o un usuario que se carga de la base, se crea con `create` y no
  // deja eventos: un administrador no es un cliente
  static register(data: {
    id: string;
    email: Email;
    passwordHash: string;
  }): User {
    const user = User.create({ ...data, role: 'BUYER' });
    user.events.push(
      new UserRegisteredEvent(user.id, user.email.value, user.role),
    );
    return user;
  }

  // Los eventos que quedaron por publicar; quien guarda al usuario los toma una sola vez
  pullEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }

  isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  // Nunca incluye el hash: un usuario que se devuelva por descuido en una respuesta no filtra la contraseña
  toJSON() {
    return { id: this.id, email: this.email.value, role: this.role };
  }
}
