import { Decimal } from 'decimal.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { DomainError } from '../../src/shared-kernel/domain.errors.js';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
};

describe('Money', () => {
  describe('creación', () => {
    it('usa PEN por defecto', () => {
      expect(Money.of('10').currency).toBe('PEN');
    });

    it('acepta texto o Decimal, nunca number', () => {
      expect(Money.of('45.50').toFixed()).toBe('45.50');
      expect(Money.of(new Decimal('45.5')).toFixed()).toBe('45.50');
    });

    it('zero() vale cero', () => {
      expect(Money.zero().toFixed()).toBe('0.00');
      expect(Money.zero('USD').currency).toBe('USD');
    });

    it('rechaza montos negativos', () => {
      expect(codeOf(() => Money.of('-0.01'))).toBe('NEGATIVE_AMOUNT');
    });

    it.each(['abc', '', 'Infinity', 'NaN'])(
      'rechaza el monto inválido %j',
      (v) => {
        expect(codeOf(() => Money.of(v))).toBe('INVALID_AMOUNT');
      },
    );
  });

  describe('aritmética exacta', () => {
    it('suma decimales sin error de coma flotante', () => {
      const sum = Money.of('0.1').add(Money.of('0.2'));
      expect(sum.equals(Money.of('0.3'))).toBe(true);
    });

    it('multiplica por un factor en texto', () => {
      expect(Money.of('100.00').multiply('0.90').toFixed()).toBe('90.00');
    });

    it('conserva toda la precisión hasta redondear', () => {
      const m = Money.of('10').multiply('0.333333');
      expect(m.amount.toString()).toBe('3.33333');
    });

    it('no admite un factor que deje el monto negativo', () => {
      expect(codeOf(() => Money.of('10').multiply('-1'))).toBe(
        'NEGATIVE_AMOUNT',
      );
    });

    it('es inmutable: operar no cambia el original', () => {
      const a = Money.of('5');
      a.add(Money.of('5'));
      a.multiply('3');
      expect(a.toFixed()).toBe('5.00');
    });

    it('no mezcla monedas', () => {
      expect(codeOf(() => Money.of('1', 'PEN').add(Money.of('1', 'USD')))).toBe(
        'CURRENCY_MISMATCH',
      );
      expect(
        codeOf(() =>
          Money.of('1', 'PEN').isGreaterOrEqualThan(Money.of('1', 'USD')),
        ),
      ).toBe('CURRENCY_MISMATCH');
    });
  });

  describe('redondeo (toFinal)', () => {
    it('Money.of("1.005").toFinal() da "1.01": mitad hacia arriba', () => {
      expect(Money.of('1.005').toFinal().toFixed()).toBe('1.01');
    });

    it.each([
      ['2.675', '2.68'], // con float daría 2.67
      ['1.004', '1.00'],
      ['1.005', '1.01'],
      ['0.125', '0.13'],
      ['99.994', '99.99'],
      ['99.995', '100.00'],
    ])('toFinal(%s) = %s', (entrada, esperado) => {
      expect(Money.of(entrada).toFinal().toFixed()).toBe(esperado);
    });

    it('redondea una sola vez: el resultado intermedio no se pierde', () => {
      // 33.335 × 3 = 100.005 → 100.01. Redondear cada paso daría 33.34 × 3 = 100.02
      const total = Money.of('33.335').multiply('3').toFinal();
      expect(total.toFixed()).toBe('100.01');
    });

    it('no modifica el original', () => {
      const m = Money.of('1.005');
      m.toFinal();
      expect(m.amount.toString()).toBe('1.005');
    });
  });

  describe('comparación', () => {
    it('equals compara monto y moneda', () => {
      expect(Money.of('90').equals(Money.of('90.00'))).toBe(true);
      expect(Money.of('90', 'PEN').equals(Money.of('90', 'USD'))).toBe(false);
      expect(Money.of('90').equals(Money.of('90.01'))).toBe(false);
    });

    it('isGreaterOrEqualThan incluye el caso igual', () => {
      const limite = Money.of('150.00');
      expect(Money.of('150.00').isGreaterOrEqualThan(limite)).toBe(true);
      expect(Money.of('150.01').isGreaterOrEqualThan(limite)).toBe(true);
      expect(Money.of('149.99').isGreaterOrEqualThan(limite)).toBe(false);
    });
  });

  describe('formato de salida', () => {
    it('toFixed da 2 decimales', () => {
      expect(Money.of('90').toFixed()).toBe('90.00');
    });

    it('toJSON es { amount, currency } con el monto en texto', () => {
      expect(Money.of('90', 'USD').toJSON()).toEqual({
        amount: '90.00',
        currency: 'USD',
      });
      expect(JSON.stringify({ total: Money.of('90') })).toBe(
        '{"total":{"amount":"90.00","currency":"PEN"}}',
      );
    });
  });
});
