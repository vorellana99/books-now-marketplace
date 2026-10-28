import { DomainError } from '../../../../shared-kernel/domain.errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La columna es UUID: un texto cualquiera llegaría como un error crudo de la base
export function assertOrderId(orderId: string): void {
  if (!UUID.test(orderId)) {
    throw new DomainError(
      'INVALID_ORDER_ID',
      `El id de pedido no es un UUID: ${orderId}`,
    );
  }
}
