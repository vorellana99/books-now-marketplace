// decimal.js, NUNCA Prisma.Decimal (regla 3 de la arquitectura)
import { Decimal } from 'decimal.js';
import { DomainError } from '../../../../shared-kernel/domain.errors.js';

export type Currency = 'PEN' | 'USD';

export class Money {
  private constructor(
    readonly amount: Decimal,
    readonly currency: Currency,
  ) {}

  // Sin `number`: un float como 1.005 ya llega mal representado
  static of(value: string | Decimal, currency: Currency = 'PEN'): Money {
    const amount = Money.parse(value);
    if (amount.isNegative()) {
      throw new DomainError(
        'NEGATIVE_AMOUNT',
        'El monto no puede ser negativo',
      );
    }
    return new Money(amount, currency);
  }

  static zero(currency: Currency = 'PEN'): Money {
    return new Money(new Decimal(0), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amount.plus(other.amount), this.currency);
  }

  // Un factor que deje el monto negativo falla: Money nunca es negativo
  multiply(factor: string | Decimal): Money {
    return Money.of(this.amount.times(factor), this.currency);
  }

  // Importe final: 2 decimales, mitad hacia arriba. Explícito en cada uso, nunca con Decimal.set() global
  toFinal(): Money {
    return new Money(
      this.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      this.currency,
    );
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  isGreaterOrEqualThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.gte(other.amount);
  }

  toFixed(): string {
    return this.amount.toFixed(2); // "90.00"
  }

  // Formato de la API: el monto viaja como texto
  toJSON() {
    return { amount: this.toFixed(), currency: this.currency };
  }

  private static parse(value: string | Decimal): Decimal {
    try {
      const amount = new Decimal(value);
      if (amount.isFinite()) return amount;
    } catch {
      // cae al error de dominio
    }
    throw new DomainError('INVALID_AMOUNT', `Monto inválido: ${String(value)}`);
  }

  private assertSameCurrency(other: Money): void {
    if (other.currency !== this.currency) {
      throw new DomainError(
        'CURRENCY_MISMATCH',
        'No se pueden operar monedas distintas',
      );
    }
  }
}
