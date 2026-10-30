import type { CheckoutRecord } from '../../../src/contexts/sales/domain/ports/checkout-log.port.js';
import {
  checkoutInProgress,
  replayOf,
} from '../../../src/contexts/sales/domain/order/checkout-replay.js';
import { Money } from '../../../src/contexts/sales/domain/shared/money.vo.js';
import {
  ConflictError,
  DomainError,
} from '../../../src/shared-kernel/domain.errors.js';

const HASH = 'a'.repeat(64);
const record = (overrides: Partial<CheckoutRecord> = {}): CheckoutRecord => ({
  orderId: 'o-1',
  status: 'COMPLETED',
  requestHash: HASH,
  charged: Money.of('90.00', 'PEN'),
  ...overrides,
});
const failure = (fn: () => unknown): Error | undefined => {
  try {
    fn();
  } catch (e) {
    return e as Error;
  }
};

// Tarea 10.16: qué responder a un reintento con la misma Idempotency-Key es una regla del dominio sobre el registro del
// checkout, no del handler
describe('replayOf: cómo se responde un reintento según cómo terminó el intento original', () => {
  it('un intento completado devuelve el pedido y lo cobrado, sin crear ni cobrar otra vez', () => {
    const charged = Money.of('90.00', 'PEN');
    expect(replayOf(record({ charged }), HASH)).toEqual({
      orderId: 'o-1',
      charged,
    });
  });

  it('la misma clave con otro carrito es IDEMPOTENCY_KEY_REUSED, también si el intento terminó bien', () => {
    for (const status of ['COMPLETED', 'PENDING', 'ABORTED'] as const) {
      const error = failure(() => replayOf(record({ status }), 'b'.repeat(64)));
      expect(error, status).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe('IDEMPOTENCY_KEY_REUSED');
    }
  });

  it('un intento en curso es CHECKOUT_IN_PROGRESS (un conflicto: se puede reintentar)', () => {
    const error = failure(() =>
      replayOf(record({ status: 'PENDING', charged: null }), HASH),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('CHECKOUT_IN_PROGRESS');
  });

  it('un intento abortado es PREVIOUS_ATTEMPT_FAILED: hay que usar otra clave', () => {
    const error = failure(() =>
      replayOf(record({ status: 'ABORTED', charged: null }), HASH),
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('PREVIOUS_ATTEMPT_FAILED');
    expect(error?.message).toMatch(/clave nueva/);
  });

  it('un checkout completo sin monto es un dato inconsistente: error técnico, no de dominio', () => {
    const error = failure(() => replayOf(record({ charged: null }), HASH));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(DomainError);
    expect(error?.message).toContain('o-1');
  });
});

describe('checkoutInProgress', () => {
  it('es el mismo conflicto que el de un intento PENDING', () => {
    const error = checkoutInProgress();
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.code).toBe('CHECKOUT_IN_PROGRESS');
  });
});
