import {
  PaymentGateway,
  type PaymentResult,
} from '../../domain/payment/payment-gateway.port.js';
import type { Money } from '../../domain/shared/money.vo.js';

export const PAYMENT_TIMEOUT_MS = 10_000;
const MAX_REASON_LENGTH = 200;

// Adaptador contra un contrato HTTP mínimo, provisional hasta elegir proveedor:
//   POST {base}/charges   { reference, amount: "90.00", currency, token }  →  200 { approved: boolean, reason?: string }
//   POST {base}/refunds   { reference }                                    →  200, 204 o 404 (no había cobro)
// Ambas llevan `Idempotency-Key: <reference>`. Un rechazo es un 200 con approved=false; cualquier otro
// código, un tiempo agotado o una respuesta inválida es un error (el cobro pudo haberse hecho: la saga reembolsa).
// El token de la tarjeta solo viaja en el cuerpo del cobro y nunca aparece en un error ni en un log
export class ExternalPaymentAdapter extends PaymentGateway {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly timeoutMs: number = PAYMENT_TIMEOUT_MS,
  ) {
    super();
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async charge(
    amount: Money,
    cardToken: string,
    orderId: string,
  ): Promise<PaymentResult> {
    const response = await this.post('charges', orderId, {
      reference: orderId,
      amount: amount.toFinal().amount.toFixed(2),
      currency: amount.currency,
      token: cardToken,
    });
    if (!response.ok) throw statusError(response.status);
    return parseCharge(response.body);
  }

  async refund(orderId: string): Promise<void> {
    const response = await this.post('refunds', orderId, {
      reference: orderId,
    });
    if (!response.ok && response.status !== 404) {
      throw statusError(response.status);
    }
  }

  private async post(
    path: string,
    idempotencyKey: string,
    body: unknown,
  ): Promise<{ ok: boolean; status: number; body: unknown }> {
    try {
      const response = await fetch(new URL(path, this.baseUrl), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(body),
        redirect: 'manual', // una redirección no se sigue: sería enviar el cobro a otro sitio
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const text = await response.text();
      return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        body: parseJson(text),
      };
    } catch (error) {
      // Solo el tipo de fallo: el error original puede arrastrar datos de la petición
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new Error(
          `La pasarela de pagos no respondió a tiempo (${this.timeoutMs} ms)`,
        );
      }
      throw new Error('No se pudo contactar a la pasarela de pagos');
    }
  }
}

function statusError(status: number): Error {
  return new Error(`La pasarela de pagos respondió ${status}`);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseCharge(body: unknown): PaymentResult {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('approved' in body) ||
    typeof body.approved !== 'boolean'
  ) {
    throw new Error('Respuesta inválida de la pasarela de pagos');
  }
  const reason =
    'reason' in body && typeof body.reason === 'string'
      ? body.reason.slice(0, MAX_REASON_LENGTH)
      : undefined;
  return body.approved ? { approved: true } : { approved: false, reason };
}
