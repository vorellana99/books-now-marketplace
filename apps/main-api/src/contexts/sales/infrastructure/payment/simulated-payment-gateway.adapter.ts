import { Injectable } from '@nestjs/common';
import {
  PaymentGateway,
  type PaymentResult,
} from '../../domain/payment/payment-gateway.port.js';
import type { Money } from '../../domain/shared/money.vo.js';

export const DECLINED_TOKEN = 'tok_declined';
export const ERROR_TOKEN = 'tok_error';

interface Charge {
  orderId: string;
  amount: string;
  currency: string;
}

// Pasarela de desarrollo, sin red: el token de la tarjeta decide el resultado.
// `tok_declined` rechaza, `tok_error` lanza un error (como una pasarela caída) y cualquier otro aprueba.
// Idempotente por orderId, como debe serlo una pasarela real. Nunca guarda el token
@Injectable()
export class SimulatedPaymentGateway extends PaymentGateway {
  private readonly results = new Map<string, PaymentResult>();
  private readonly ledger: Charge[] = [];
  private readonly refunded: string[] = [];

  // Libro de lo cobrado y de lo reembolsado, para que los tests comprueben el efecto real
  get charges(): readonly Charge[] {
    return this.ledger;
  }
  get refunds(): readonly string[] {
    return this.refunded;
  }

  charge(
    amount: Money,
    cardToken: string,
    orderId: string,
  ): Promise<PaymentResult> {
    const previous = this.results.get(orderId);
    if (previous) return Promise.resolve(previous);

    if (cardToken === ERROR_TOKEN) {
      // No se recuerda: el error no decidió nada, un reintento puede salir distinto
      return Promise.reject(new Error('La pasarela simulada falló'));
    }

    const result: PaymentResult =
      cardToken === DECLINED_TOKEN
        ? { approved: false, reason: 'tarjeta rechazada' }
        : { approved: true };
    this.results.set(orderId, result);
    if (result.approved) {
      this.ledger.push({
        orderId,
        amount: amount.amount.toFixed(2),
        currency: amount.currency,
      });
    }
    return Promise.resolve(result);
  }

  // Idempotente: solo reembolsa lo cobrado, y una sola vez
  refund(orderId: string): Promise<void> {
    const charged = this.ledger.some((c) => c.orderId === orderId);
    if (charged && !this.refunded.includes(orderId)) {
      this.refunded.push(orderId);
    }
    return Promise.resolve();
  }
}
