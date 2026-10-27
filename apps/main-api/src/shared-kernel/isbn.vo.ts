import { DomainError } from './domain.errors.js';

// ISBN-13 normalizado: solo dígitos, con el dígito de control verificado
export class Isbn {
  private constructor(readonly value: string) {}

  static create(raw: string): Isbn {
    const value = raw.replace(/[-\s]/g, '');
    if (!/^\d{13}$/.test(value) || !Isbn.hasValidCheckDigit(value)) {
      throw new DomainError('INVALID_ISBN', `ISBN inválido: ${raw}`);
    }
    return new Isbn(value);
  }

  equals(other: Isbn): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  toJSON(): string {
    return this.value;
  }

  // Los 12 primeros dígitos pesan 1 y 3 alternados; el control completa la suma a múltiplo de 10
  private static hasValidCheckDigit(digits: string): boolean {
    const sum = digits
      .slice(0, 12)
      .split('')
      .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (sum % 10)) % 10 === Number(digits[12]);
  }
}
