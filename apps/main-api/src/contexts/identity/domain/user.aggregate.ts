import { DomainError } from '../../../shared-kernel/domain.errors.js';
import type { Email } from './email.vo.js';

export type Role = 'BUYER' | 'ADMIN';
const ROLES: readonly string[] = ['BUYER', 'ADMIN'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Quien puede iniciar sesión. Guarda el hash de la contraseña, nunca la contraseña, y no lo muestra al serializarse
export class User {
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
    if (!ROLES.includes(data.role as string)) {
      throw new DomainError('INVALID_ROLE', 'El rol debe ser BUYER o ADMIN');
    }
    return new User(data.id, data.email, data.passwordHash, data.role);
  }

  isAdmin(): boolean {
    return this.role === 'ADMIN';
  }

  // Nunca incluye el hash: un usuario que se devuelva por descuido en una respuesta no filtra la contraseña
  toJSON() {
    return { id: this.id, email: this.email.value, role: this.role };
  }
}
