import { PaymentGateway } from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { SimulatedPaymentGateway } from '../../src/contexts/sales/infrastructure/payment/simulated-payment-gateway.adapter.js';

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
});
