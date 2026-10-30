import { DomainError } from '../../../shared-kernel/domain.errors.js';

const MAX_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;
const SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hasControlChars = (text: string) => {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

// El correo con el que se inicia sesión: recortado y en minúsculas, así "Ana@Example.com" y "ana@example.com" son la
// misma cuenta. Es de Identidad y no el de Ventas: cada contexto tiene el suyo
export class Email {
  private constructor(readonly value: string) {}

  static create(raw: string): Email {
    if (typeof raw !== 'string') throw invalid();
    const value = raw.trim().toLowerCase();
    if (
      value.length > MAX_LENGTH ||
      hasControlChars(value) ||
      !SHAPE.test(value) ||
      value.indexOf('@') > MAX_LOCAL_LENGTH
    ) {
      throw invalid();
    }
    return new Email(value);
  }

  // Para quien trata un correo mal escrito igual que uno desconocido (el inicio de sesión): undefined en vez de lanzar
  static tryCreate(raw: string): Email | undefined {
    try {
      return Email.create(raw);
    } catch {
      return undefined;
    }
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

// El mensaje no repite lo recibido: un correo mal escrito puede ser una contraseña pegada por error
const invalid = () =>
  new DomainError('INVALID_EMAIL', 'El correo no tiene un formato válido');
