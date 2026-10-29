import { Order } from '../../../src/contexts/sales/domain/order/order.aggregate.js';
import { Money } from '../../../src/contexts/sales/domain/shared/money.vo.js';
import type { DomainError } from '../../../src/shared-kernel/domain.errors.js';
import { Isbn } from '../../../src/shared-kernel/isbn.vo.js';
import { ShippingAddress } from '../../../src/contexts/sales/domain/order/shipping-address.vo.js';
import { ADDRESS_DATA } from '../../fakes/fixtures.js';

const A = Isbn.create('9780306406157');
const B = Isbn.create('9780306406140');

const line = (
  isbn = A,
  quantity = 1,
  price = '45.00',
  currency: 'PEN' | 'USD' = 'PEN',
) => ({
  isbn,
  title: 'Libro',
  unitPrice: Money.of(price, currency),
  quantity,
});

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
};

describe('Order.restore: reconstruir un pedido ya confirmado desde la base de datos', () => {
  it('devuelve un pedido confirmado, con su cliente, sus líneas y su moneda', () => {
    const order = Order.restore({
      id: 'o-1',
      customerId: 'c-1',
      lines: [line(A, 2, '45.00'), line(B, 1, '60.50')],
    });

    expect(order.id).toBe('o-1');
    expect(order.customerId).toBe('c-1');
    expect(order.status).toBe('PLACED');
    expect(order.currency).toBe('PEN');
    expect(
      order
        .getLines()
        .map((l) => [l.isbn.value, l.title, l.unitPrice.toFixed(), l.quantity]),
    ).toEqual([
      [A.value, 'Libro', '45.00', 2],
      [B.value, 'Libro', '60.50', 1],
    ]);
    expect(order.subtotal().toFixed()).toBe('150.50');
  });

  it('no genera eventos: el pedido ya se confirmó y su evento ya se guardó', () => {
    expect(
      Order.restore({
        id: 'o-1',
        customerId: 'c-1',
        lines: [line()],
      }).pullEvents(),
    ).toEqual([]);
  });

  it('sigue siendo un pedido confirmado: no admite más libros ni confirmarse otra vez', () => {
    const order = Order.restore({
      id: 'o-1',
      customerId: 'c-1',
      lines: [line()],
    });

    expect(codeOf(() => order.addBook(B, 'Otro', Money.of('10.00'), 1))).toBe(
      'ORDER_ALREADY_PLACED',
    );
    expect(codeOf(() => order.place())).toBe('ORDER_ALREADY_PLACED');
  });

  it('conserva los precios con más de dos decimales, como se guardan en la base', () => {
    const order = Order.restore({
      id: 'o-1',
      customerId: 'c-1',
      lines: [line(A, 3, '33.335')],
    });
    expect(order.subtotal().amount.toString()).toBe('100.005');
  });

  it('respeta la moneda del pedido', () => {
    expect(
      Order.restore({
        id: 'o-1',
        customerId: 'c-1',
        lines: [line(A, 1, '20.00', 'USD')],
      }).currency,
    ).toBe('USD');
  });

  it('no aplica los límites de hoy a un pedido de ayer: 11 unidades se restauran tal cual', () => {
    // el máximo de 10 se exige al comprar; si la regla cambia, los pedidos antiguos deben seguir leyéndose
    const order = Order.restore({
      id: 'o-1',
      customerId: 'c-1',
      lines: [line(A, 11)],
    });
    expect(order.getLines()[0].quantity).toBe(11);
  });

  describe('rechaza datos que no pueden ser un pedido', () => {
    it('sin líneas', () => {
      expect(
        codeOf(() =>
          Order.restore({ id: 'o-1', customerId: 'c-1', lines: [] }),
        ),
      ).toBe('EMPTY_ORDER');
    });

    it('con monedas mezcladas', () => {
      expect(
        codeOf(() =>
          Order.restore({
            id: 'o-1',
            customerId: 'c-1',
            lines: [line(A, 1, '10.00', 'PEN'), line(B, 1, '10.00', 'USD')],
          }),
        ),
      ).toBe('CURRENCY_MISMATCH');
    });

    it('con el mismo libro dos veces', () => {
      expect(
        codeOf(() =>
          Order.restore({
            id: 'o-1',
            customerId: 'c-1',
            lines: [line(A), line(A)],
          }),
        ),
      ).toBe('DUPLICATE_LINE');
    });

    it.each([0, -1, 1.5, Number.NaN])('con la cantidad %s', (quantity) => {
      expect(
        codeOf(() =>
          Order.restore({
            id: 'o-1',
            customerId: 'c-1',
            lines: [line(A, quantity)],
          }),
        ),
      ).toBe('INVALID_QUANTITY');
    });
  });
});

describe('Order.restore: dirección de envío', () => {
  const address = ShippingAddress.restore(ADDRESS_DATA);
  const lines = [line(A, 1, '45.00')];

  it('conserva la dirección guardada', () => {
    const order = Order.restore({
      id: 'o-1',
      customerId: 'c-1',
      lines,
      shippingAddress: address,
    });
    expect(order.shippingAddress).toBe(address);
  });

  it('un pedido anterior a la dirección (null) se lee con dirección null', () => {
    const order = Order.restore({
      id: 'o-1',
      customerId: 'c-1',
      lines,
      shippingAddress: null,
    });
    expect(order.shippingAddress).toBeNull();
  });

  it('si no se indica, queda en null', () => {
    expect(
      Order.restore({ id: 'o-1', customerId: 'c-1', lines }).shippingAddress,
    ).toBeNull();
  });
});
