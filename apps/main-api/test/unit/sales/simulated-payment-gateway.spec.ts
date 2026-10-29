import { PaymentGateway } from '../../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import { Money } from '../../../src/contexts/sales/domain/shared/money.vo.js';
import { SimulatedPaymentGateway } from '../../../src/contexts/sales/infrastructure/adapters/simulated-payment-gateway.adapter.js';

const ORDER = '0196a000-0000-7000-8000-000000000001';

describe('SimulatedPaymentGateway (pasarela de desarrollo)', () => {
  it('es un PaymentGateway', () => {
    expect(new SimulatedPaymentGateway()).toBeInstanceOf(PaymentGateway);
  });

  describe('charge: el token decide el resultado', () => {
    it('un token cualquiera aprueba y queda en el libro de cobros', async () => {
      const gateway = new SimulatedPaymentGateway();

      const result = await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);

      expect(result).toEqual({ approved: true });
      expect(gateway.charges).toEqual([
        { orderId: ORDER, amount: '90.00', currency: 'PEN' },
      ]);
    });

    it('tok_declined rechaza con un motivo y no cobra nada', async () => {
      const gateway = new SimulatedPaymentGateway();

      const result = await gateway.charge(
        Money.of('90.00'),
        'tok_declined',
        ORDER,
      );

      expect(result.approved).toBe(false);
      expect(result.reason).toBeTruthy();
      expect(gateway.charges).toEqual([]);
    });

    it('tok_error lanza un error, como una pasarela que se cae, y no cobra nada', async () => {
      const gateway = new SimulatedPaymentGateway();

      await expect(
        gateway.charge(Money.of('90.00'), 'tok_error', ORDER),
      ).rejects.toThrow();
      expect(gateway.charges).toEqual([]);
    });

    it('solo el texto exacto activa la convención', async () => {
      const gateway = new SimulatedPaymentGateway();
      for (const token of ['TOK_DECLINED', 'tok_declined_x', ' tok_error']) {
        const result = await gateway.charge(
          Money.of('1.00'),
          token,
          `${ORDER}-${token}`,
        );
        expect(result.approved).toBe(true);
      }
    });

    it('guarda el monto en dólares con su moneda', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('23.50', 'USD'), 'tok_visa', ORDER);
      expect(gateway.charges[0]).toMatchObject({
        amount: '23.50',
        currency: 'USD',
      });
    });

    it('nunca guarda el token de la tarjeta', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('90.00'), 'tok_secreto_123', ORDER);
      expect(JSON.stringify(gateway.charges)).not.toContain('tok_secreto_123');
    });
  });

  describe('charge: idempotente por orderId', () => {
    it('cobrar dos veces la misma referencia cobra una sola vez', async () => {
      const gateway = new SimulatedPaymentGateway();

      const first = await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);
      const second = await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);

      expect(first).toEqual(second);
      expect(gateway.charges).toHaveLength(1);
    });

    it('devuelve el resultado original aunque cambien el monto o el token', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);

      const again = await gateway.charge(
        Money.of('10.00'),
        'tok_declined',
        ORDER,
      );

      expect(again).toEqual({ approved: true });
      expect(gateway.charges).toEqual([
        { orderId: ORDER, amount: '90.00', currency: 'PEN' },
      ]);
    });

    it('un rechazo también se repite igual', async () => {
      const gateway = new SimulatedPaymentGateway();
      const first = await gateway.charge(
        Money.of('90.00'),
        'tok_declined',
        ORDER,
      );
      const second = await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);
      expect(second).toEqual(first);
      expect(gateway.charges).toEqual([]);
    });

    it('un tok_error no se recuerda: reintentar con otro token puede cobrar', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway
        .charge(Money.of('90.00'), 'tok_error', ORDER)
        .catch(() => undefined);

      const retry = await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);

      expect(retry.approved).toBe(true);
      expect(gateway.charges).toHaveLength(1); // cobró de verdad, no repitió un resultado recordado
    });

    it('referencias distintas se cobran por separado', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('10.00'), 'tok_visa', 'a');
      await gateway.charge(Money.of('20.00'), 'tok_visa', 'b');
      expect(gateway.charges.map((c) => c.orderId)).toEqual(['a', 'b']);
    });
  });

  describe('refund', () => {
    it('reembolsa un cobro y queda en el libro', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);

      await gateway.refund(ORDER);

      expect(gateway.refunds).toEqual([ORDER]);
    });

    it('es idempotente: reembolsar dos veces lo registra una sola', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('90.00'), 'tok_visa', ORDER);

      await gateway.refund(ORDER);
      await gateway.refund(ORDER);

      expect(gateway.refunds).toEqual([ORDER]);
    });

    it('sin cobro para esa referencia no hace nada ni falla', async () => {
      const gateway = new SimulatedPaymentGateway();
      await expect(gateway.refund(ORDER)).resolves.toBeUndefined();
      expect(gateway.refunds).toEqual([]);
    });

    it('un pago rechazado no se reembolsa', async () => {
      const gateway = new SimulatedPaymentGateway();
      await gateway.charge(Money.of('90.00'), 'tok_declined', ORDER);
      await gateway.refund(ORDER);
      expect(gateway.refunds).toEqual([]);
    });
  });

  describe('con demora, como un proveedor real', () => {
    const DELAY = 3000;
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // Resuelve la promesa con un valor marcador para saber si ya terminó, sin esperarla
    const settled = <T>(promise: Promise<T>) => {
      const state = {
        done: false,
        value: undefined as T | undefined,
        error: undefined as unknown,
      };
      promise.then(
        (value) => Object.assign(state, { done: true, value }),
        (error: unknown) => Object.assign(state, { done: true, error }),
      );
      return state;
    };

    it('expone la demora configurada, y por defecto no hay ninguna', () => {
      expect(new SimulatedPaymentGateway(DELAY).delayMs).toBe(DELAY);
      expect(new SimulatedPaymentGateway().delayMs).toBe(0);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rechaza una demora de %s',
      (value) => {
        expect(() => new SimulatedPaymentGateway(value)).toThrow(/demora/i);
      },
    );

    it('el cobro tarda lo configurado y no cobra antes', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      const charge = settled(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      );

      await vi.advanceTimersByTimeAsync(DELAY - 1);
      expect(charge.done).toBe(false);
      expect(gateway.charges).toEqual([]);

      await vi.advanceTimersByTimeAsync(1);
      expect(charge.done).toBe(true);
      expect(charge.value).toEqual({ approved: true });
      expect(gateway.charges).toHaveLength(1);
    });

    it('un rechazo también tarda', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      const charge = settled(
        gateway.charge(Money.of('90.00'), 'tok_declined', ORDER),
      );

      await vi.advanceTimersByTimeAsync(DELAY - 1);
      expect(charge.done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(charge.value).toMatchObject({ approved: false });
    });

    it('un error también tarda: la pasarela se cae después de un rato', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      const charge = settled(
        gateway.charge(Money.of('90.00'), 'tok_error', ORDER),
      );

      await vi.advanceTimersByTimeAsync(DELAY - 1);
      expect(charge.done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(charge.error).toBeInstanceOf(Error);
    });

    it('dos cobros de la misma referencia a la vez cobran una sola vez y terminan juntos', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      const first = settled(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      );
      await vi.advanceTimersByTimeAsync(1000);
      const second = settled(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      );

      await vi.advanceTimersByTimeAsync(DELAY - 1000 - 1);
      expect(first.done || second.done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(first.value).toEqual({ approved: true });
      expect(second.value).toEqual({ approved: true });
      expect(gateway.charges).toHaveLength(1);
    });

    it('si el cobro en curso falla, quienes esperaban fallan con él, y un reintento puede cobrar', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      const first = settled(
        gateway.charge(Money.of('90.00'), 'tok_error', ORDER),
      );
      const second = settled(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      );
      await vi.advanceTimersByTimeAsync(DELAY);
      expect(first.error).toBeInstanceOf(Error);
      expect(second.error).toBeInstanceOf(Error);

      const retry = settled(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      );
      await vi.advanceTimersByTimeAsync(DELAY);
      expect(retry.value).toEqual({ approved: true });
      expect(gateway.charges).toHaveLength(1);
    });

    it('el reembolso también tarda', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      const charged = settled(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      );
      await vi.advanceTimersByTimeAsync(DELAY);
      expect(charged.done).toBe(true);

      const refund = settled(gateway.refund(ORDER));
      await vi.advanceTimersByTimeAsync(DELAY - 1);
      expect(refund.done).toBe(false);
      expect(gateway.refunds).toEqual([]);

      await vi.advanceTimersByTimeAsync(1);
      expect(refund.done).toBe(true);
      expect(gateway.refunds).toEqual([ORDER]);
    });

    it('dos reembolsos a la vez lo registran una sola vez', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      settled(gateway.charge(Money.of('90.00'), 'tok_visa', ORDER));
      await vi.advanceTimersByTimeAsync(DELAY);

      const a = settled(gateway.refund(ORDER));
      const b = settled(gateway.refund(ORDER));
      await vi.advanceTimersByTimeAsync(DELAY);

      expect(a.done && b.done).toBe(true);
      expect(gateway.refunds).toEqual([ORDER]);
    });

    it('un reembolso pedido con el cobro en curso espera a que termine y luego reembolsa', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      settled(gateway.charge(Money.of('90.00'), 'tok_visa', ORDER));
      await vi.advanceTimersByTimeAsync(1000);

      const refund = settled(gateway.refund(ORDER));
      await vi.advanceTimersByTimeAsync(DELAY - 1000); // termina el cobro
      expect(gateway.charges).toHaveLength(1);
      expect(refund.done).toBe(false);

      // Si el reembolso no esperara al cobro, ya habría terminado aquí (1 s + su propia demora)
      await vi.advanceTimersByTimeAsync(1000);
      expect(refund.done).toBe(false);

      await vi.advanceTimersByTimeAsync(DELAY - 1000); // el cobro terminó a los 3 s; su demora, a los 6 s
      expect(refund.done).toBe(true);
      expect(gateway.refunds).toEqual([ORDER]);
    });

    it('un reembolso con el cobro en curso que falla no falla: no había cobro que devolver', async () => {
      const gateway = new SimulatedPaymentGateway(DELAY);
      settled(gateway.charge(Money.of('90.00'), 'tok_error', ORDER));
      const refund = settled(gateway.refund(ORDER));

      await vi.advanceTimersByTimeAsync(DELAY * 2);

      expect(refund.done).toBe(true);
      expect(refund.error).toBeUndefined();
      expect(gateway.refunds).toEqual([]);
    });

    it('con demora 0 no espera ningún temporizador', async () => {
      vi.useFakeTimers();
      const gateway = new SimulatedPaymentGateway(0);
      // sin avanzar el reloj: si esperara un temporizador, nunca terminaría
      await expect(
        gateway.charge(Money.of('90.00'), 'tok_visa', ORDER),
      ).resolves.toEqual({ approved: true });
      await expect(gateway.refund(ORDER)).resolves.toBeUndefined();
    });
  });
});
