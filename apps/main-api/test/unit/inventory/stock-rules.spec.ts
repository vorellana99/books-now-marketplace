import {
  MAX_ADDITION,
  MAX_AVAILABLE,
  assertOrderId,
  assertValidAddition,
  assertValidLines,
} from '../../../src/contexts/inventory/domain/stock/stock-rules.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';

const failure = (fn: () => unknown): DomainError | undefined => {
  try {
    fn();
  } catch (e) {
    return e as DomainError;
  }
};
const ISBN_A = '9780306406157';
const ISBN_B = '9780132350884';

describe('límites del stock', () => {
  it('una carga admite hasta 100 000 unidades y lo disponible hasta un millón', () => {
    expect(MAX_ADDITION).toBe(100_000);
    expect(MAX_AVAILABLE).toBe(1_000_000);
  });

  it('un millón cabe en el entero de 32 bits de la base', () => {
    expect(MAX_AVAILABLE).toBeLessThan(2 ** 31);
  });
});

describe('assertOrderId', () => {
  it('acepta un UUID, en mayúsculas o minúsculas', () => {
    expect(() =>
      assertOrderId('0196a000-0000-7000-8000-0000000000aa'),
    ).not.toThrow();
    expect(() =>
      assertOrderId('0196A000-0000-7000-8000-0000000000AA'),
    ).not.toThrow();
  });

  it.each([
    '',
    'pedido-1',
    '0196a000',
    '0196a000-0000-7000-8000-0000000000aaz',
  ])('rechaza %j con INVALID_ORDER_ID y nombra el valor', (value) => {
    const error = failure(() => assertOrderId(value));
    expect(error?.code).toBe('INVALID_ORDER_ID');
    expect(error?.message).toContain(value);
  });
});

describe('assertValidLines', () => {
  it('acepta líneas con cantidades enteras de al menos 1 y libros distintos', () => {
    expect(() =>
      assertValidLines([
        { isbn: ISBN_A, quantity: 1 },
        { isbn: ISBN_B, quantity: 7 },
      ]),
    ).not.toThrow();
  });

  it('sin líneas es EMPTY_RESERVATION', () => {
    expect(failure(() => assertValidLines([]))?.code).toBe('EMPTY_RESERVATION');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'una cantidad de %s es INVALID_QUANTITY y nombra el libro',
    (quantity) => {
      const error = failure(() =>
        assertValidLines([{ isbn: ISBN_A, quantity }]),
      );
      expect(error?.code).toBe('INVALID_QUANTITY');
      expect(error?.message).toContain(ISBN_A);
    },
  );

  it('una cantidad que no es un número (llegó como texto) es INVALID_QUANTITY', () => {
    const lines = [{ isbn: ISBN_A, quantity: '2' as unknown as number }];
    expect(failure(() => assertValidLines(lines))?.code).toBe(
      'INVALID_QUANTITY',
    );
  });

  it('el mismo libro dos veces es DUPLICATE_RESERVATION_LINE y nombra el libro', () => {
    const error = failure(() =>
      assertValidLines([
        { isbn: ISBN_A, quantity: 1 },
        { isbn: ISBN_B, quantity: 1 },
        { isbn: ISBN_A, quantity: 2 },
      ]),
    );
    expect(error?.code).toBe('DUPLICATE_RESERVATION_LINE');
    expect(error?.message).toContain(ISBN_A);
  });

  it('una cantidad inválida se detecta antes que una línea repetida de la misma línea', () => {
    const error = failure(() =>
      assertValidLines([
        { isbn: ISBN_A, quantity: 1 },
        { isbn: ISBN_A, quantity: 0 },
      ]),
    );
    expect(error?.code).toBe('INVALID_QUANTITY');
  });
});

describe('assertValidAddition', () => {
  it.each([1, 2, 500, MAX_ADDITION])('acepta %i', (quantity) => {
    expect(() => assertValidAddition(quantity)).not.toThrow();
  });

  it.each([0, -3, MAX_ADDITION + 1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rechaza %s con INVALID_QUANTITY y dice el rango',
    (quantity) => {
      const error = failure(() => assertValidAddition(quantity));
      expect(error?.code).toBe('INVALID_QUANTITY');
      expect(error?.message).toContain('de 1 a 100000');
    },
  );

  it('una cantidad que no es un número es INVALID_QUANTITY', () => {
    expect(
      failure(() => assertValidAddition('5' as unknown as number))?.code,
    ).toBe('INVALID_QUANTITY');
  });
});
