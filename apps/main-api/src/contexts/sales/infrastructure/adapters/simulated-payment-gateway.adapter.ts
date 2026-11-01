import {
  PaymentGateway,
  type PaymentResult,
} from '../../domain/ports/payment-gateway.port.js';
import type { Money } from '../../domain/shared/money.vo.js';

export const DECLINED_TOKEN = 'tok_declined';
export const ERROR_TOKEN = 'tok_error';

interface Charge {
  orderId: string;
  amount: string;
  currency: string;
}

const sleep = (ms: number): Promise<void> =>
  ms === 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// Pasarela de desarrollo, sin red: el token de la tarjeta decide el resultado.
// `tok_declined` rechaza, `tok_error` lanza un error (como una pasarela caída) y cualquier otro aprueba.
// Cada operación tarda `delayMs`, como un proveedor de verdad: así se ven la lentitud de la API y la ventana
// en la que otra petición con la misma clave recibe 409.
// Idempotente por orderId, también entre dos cobros que coinciden dentro de la demora. Nunca guarda el token
export class SimulatedPaymentGateway extends PaymentGateway {
  // Cobros en curso o resueltos, por orderId. Guardar la promesa (y no solo el resultado) es lo que evita cobrar
  // dos veces cuando el segundo cobro llega mientras el primero todavía espera
  private readonly charging = new Map<string, Promise<PaymentResult>>();
  private readonly ledger: Charge[] = [];
  private readonly refunded: string[] = [];

  constructor(readonly delayMs = 0) {
    super();
    if (!Number.isInteger(delayMs) || delayMs < 0) {
      throw new Error(
        `La demora de la pasarela simulada debe ser un entero de 0 o más, y llegó ${delayMs}`,
      );
    }
  }

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
    const inProgress = this.charging.get(orderId);
    if (inProgress) return inProgress;

    const attempt = this.process(amount, cardToken, orderId);
    this.charging.set(orderId, attempt);
    // Un error no se recuerda: no decidió nada, y un reintento puede salir distinto
    attempt.catch(() => this.charging.delete(orderId));
    return attempt;
  }

  // Idempotente: solo reembolsa lo cobrado, y una sola vez. Si el cobro sigue en curso, espera a que termine
  async refund(orderId: string): Promise<void> {
    await this.charging.get(orderId)?.catch(() => undefined);
    await sleep(this.delayMs);
    const charged = this.ledger.some((c) => c.orderId === orderId);
    if (charged && !this.refunded.includes(orderId)) {
      this.refunded.push(orderId);
    }
  }

  private async process(
    amount: Money,
    cardToken: string,
    orderId: string,
  ): Promise<PaymentResult> {
    await sleep(this.delayMs);
    if (cardToken === ERROR_TOKEN) {
      throw new Error('La pasarela simulada falló');
    }
    if (cardToken === DECLINED_TOKEN) {
      return { approved: false, reason: 'tarjeta rechazada' };
    }
    this.ledger.push({
      orderId,
      amount: amount.amount.toFixed(2),
      currency: amount.currency,
    });
    return { approved: true };
  }
}
