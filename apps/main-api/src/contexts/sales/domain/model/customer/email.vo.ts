import { DomainError } from '../../../../../shared-kernel/domain.errors.js';

const MAX_LENGTH = 254; // límite práctico de una dirección de correo (RFC 5321)

// parte local, una sola arroba y un dominio con al menos un punto, sin puntos seguidos ni finales
const EMAIL_FORMAT = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

// Normalizado (sin espacios, en minúsculas) para que dos escrituras del mismo correo se comparen igual
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    const value = raw.trim().toLowerCase();
    if (value.length > MAX_LENGTH || !EMAIL_FORMAT.test(value)) {
      throw new DomainError('INVALID_EMAIL', `Correo inválido: ${raw}`);
    }
    return new Email(value);
  }

  equals(other: Email): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }
}
