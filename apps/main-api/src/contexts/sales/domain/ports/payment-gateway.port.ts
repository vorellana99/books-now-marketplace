import type { Money } from '../shared/money.vo.js';

export interface PaymentResult {
  approved: boolean;
  reason?: string; // motivo del rechazo, si lo hubo
}

export abstract class PaymentGateway {
  // El orderId es la referencia: la pasarela debe tratarlo como clave de idempotencia
  abstract charge(
    amount: Money,
    cardToken: string,
    orderId: string,
  ): Promise<PaymentResult>;
  // Idempotente: si no hubo cobro para ese orderId, no hace nada
  abstract refund(orderId: string): Promise<void>;
}
