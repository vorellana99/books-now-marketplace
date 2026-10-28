import type { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import {
  PaymentGateway,
  type PaymentResult,
} from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';

interface Options {
  approved?: boolean; // por defecto, aprueba
  reason?: string; // motivo del rechazo
  timeout?: boolean; // cobra (puede haberse hecho) y luego no responde a tiempo
  refundFails?: boolean;
}

export class FakePaymentGateway extends PaymentGateway {
  // Todos los intentos de cobro, aprobados o no
  readonly attempts: { amount: Money; cardToken: string; orderId: string }[] =
    [];
  // Lo realmente cobrado: lo aprobado, y lo que se cobró pero no llegó la respuesta (timeout).
  // Un pago rechazado no es un cobro
  readonly charged: { amount: Money; cardToken: string; orderId: string }[] =
    [];
  readonly refunded: string[] = [];

  constructor(private readonly options: Options = {}) {
    super();
  }

  charge(
    amount: Money,
    cardToken: string,
    orderId: string,
  ): Promise<PaymentResult> {
    const attempt = { amount, cardToken, orderId };
    this.attempts.push(attempt);
    if (this.options.approved === false && !this.options.timeout) {
      return Promise.resolve({ approved: false, reason: this.options.reason });
    }
    this.charged.push(attempt);
    if (this.options.timeout) {
      return Promise.reject(new Error('Tiempo de espera agotado'));
    }
    return Promise.resolve({ approved: true });
  }

  // Idempotente: solo reembolsa lo cobrado, y una sola vez
  refund(orderId: string): Promise<void> {
    if (this.options.refundFails) {
      return Promise.reject(new Error('Falla del reembolso'));
    }
    const charged = this.charged.some((c) => c.orderId === orderId);
    if (charged && !this.refunded.includes(orderId))
      this.refunded.push(orderId);
    return Promise.resolve();
  }
}
