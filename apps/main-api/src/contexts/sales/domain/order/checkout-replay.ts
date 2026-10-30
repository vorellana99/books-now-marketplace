import {
  ConflictError,
  DomainError,
} from '../../../../shared-kernel/domain.errors.js';
import type { CheckoutRecord } from '../ports/checkout-log.port.js';
import type { Money } from '../shared/money.vo.js';

export interface ReplayedCheckout {
  orderId: string;
  charged: Money;
}

export const checkoutInProgress = (): ConflictError =>
  new ConflictError(
    'CHECKOUT_IN_PROGRESS',
    'Esta compra todavía se está procesando',
  );

// Responde un reintento con la misma Idempotency-Key según cómo terminó el intento original: nunca crea otro pedido ni
// cobra otra vez. La misma clave con otro carrito es un error (también si el intento terminó bien); uno completado
// devuelve lo ya cobrado; uno en curso es un conflicto reintentable y uno abortado exige una clave nueva
export function replayOf(
  checkout: CheckoutRecord,
  requestHash: string,
): ReplayedCheckout {
  if (checkout.requestHash !== requestHash) {
    throw new DomainError(
      'IDEMPOTENCY_KEY_REUSED',
      'Esta Idempotency-Key ya se usó con otro carrito',
    );
  }
  if (checkout.status === 'COMPLETED') {
    if (!checkout.charged)
      throw new Error(
        `El checkout ${checkout.orderId} está completo pero no tiene monto`,
      );
    return { orderId: checkout.orderId, charged: checkout.charged };
  }
  if (checkout.status === 'PENDING') throw checkoutInProgress();
  throw new DomainError(
    'PREVIOUS_ATTEMPT_FAILED',
    'El intento anterior con esta clave falló; usa una clave nueva',
  );
}
