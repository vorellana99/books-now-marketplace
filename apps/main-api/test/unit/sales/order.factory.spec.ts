import { OrderFactory } from '../../../src/contexts/sales/domain/model/order/order.factory.js';
import { DomainError } from '../../../src/shared-kernel/domain.errors.js';
import { ShippingAddress } from '../../../src/contexts/sales/domain/model/order/shipping-address.vo.js';
import { ADDRESS_DATA, ADDRESS } from '../../fakes/fixtures.js';

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
};

const item = (overrides: Record<string, unknown> = {}) => ({
  isbn: '9780306406157',
  quantity: 1,
  title: 'Clean Code',
  price: '45.00',
  currency: 'PEN' as const,
  ...overrides,
});

describe('OrderFactory.fromCart', () => {
  it('arma un pedido en borrador con los datos del carrito', () => {
    const order = OrderFactory.fromCart(
      'o-1',
      'c-1',
      [
        item({ quantity: 2 }),
        item({ isbn: '9780306406140', title: 'Refactoring', price: '60.50' }),
      ],
      ADDRESS,
    );

    expect(order.id).toBe('o-1');
    expect(order.customerId).toBe('c-1');
    expect(order.status).toBe('DRAFT');
    expect(order.pullEvents()).toEqual([]);
    expect(
      order
        .getLines()
        .map((l) => [l.isbn.value, l.title, l.unitPrice.toFixed(), l.quantity]),
    ).toEqual([
      ['9780306406157', 'Clean Code', '45.00', 2],
      ['9780306406140', 'Refactoring', '60.50', 1],
    ]);
    expect(order.subtotal().toFixed()).toBe('150.50');
  });

  it('convierte el precio de texto sin pasar por number', () => {
    const order = OrderFactory.fromCart(
      'o-1',
      'c-1',
      [item({ price: '33.335', quantity: 3 })],
      ADDRESS,
    );
    expect(order.subtotal().amount.toString()).toBe('100.005');
  });

  it('acepta el ISBN con guiones', () => {
    const order = OrderFactory.fromCart(
      'o-1',
      'c-1',
      [item({ isbn: '978-0-306-40615-7' })],
      ADDRESS,
    );
    expect(order.getLines()[0].isbn.value).toBe('9780306406157');
  });

  it('suma las líneas repetidas del mismo libro', () => {
    const order = OrderFactory.fromCart(
      'o-1',
      'c-1',
      [item({ quantity: 2 }), item({ quantity: 3 })],
      ADDRESS,
    );
    expect(order.getLines()).toHaveLength(1);
    expect(order.getLines()[0].quantity).toBe(5);
  });

  it('respeta la moneda del carrito', () => {
    const order = OrderFactory.fromCart(
      'o-1',
      'c-1',
      [item({ price: '12.00', currency: 'USD' })],
      ADDRESS,
    );
    expect(order.currency).toBe('USD');
  });

  it('rechaza un carrito vacío', () => {
    expect(codeOf(() => OrderFactory.fromCart('o-1', 'c-1', [], ADDRESS))).toBe(
      'EMPTY_ORDER',
    );
  });

  it('rechaza un ISBN inválido', () => {
    expect(
      codeOf(() =>
        OrderFactory.fromCart('o-1', 'c-1', [item({ isbn: '123' })], ADDRESS),
      ),
    ).toBe('INVALID_ISBN');
  });

  it('rechaza un precio inválido o negativo', () => {
    expect(
      codeOf(() =>
        OrderFactory.fromCart(
          'o-1',
          'c-1',
          [item({ price: 'gratis' })],
          ADDRESS,
        ),
      ),
    ).toBe('INVALID_AMOUNT');
    expect(
      codeOf(() =>
        OrderFactory.fromCart(
          'o-1',
          'c-1',
          [item({ price: '-5.00' })],
          ADDRESS,
        ),
      ),
    ).toBe('NEGATIVE_AMOUNT');
  });

  it('rechaza mezclar monedas', () => {
    expect(
      codeOf(() =>
        OrderFactory.fromCart(
          'o-1',
          'c-1',
          [item(), item({ isbn: '9780306406140', currency: 'USD' })],
          ADDRESS,
        ),
      ),
    ).toBe('CURRENCY_MISMATCH');
  });

  it('rechaza más de 10 unidades de un libro repartidas en varias líneas', () => {
    expect(
      codeOf(() =>
        OrderFactory.fromCart(
          'o-1',
          'c-1',
          [item({ quantity: 6 }), item({ quantity: 5 })],
          ADDRESS,
        ),
      ),
    ).toBe('MAX_QUANTITY_EXCEEDED');
  });
});

describe('OrderFactory.fromCart: dirección de envío', () => {
  const address = ShippingAddress.create(ADDRESS_DATA);

  it('pasa la dirección al pedido', () => {
    const order = OrderFactory.fromCart('o-1', 'c-1', [item()], address);
    expect(order.shippingAddress).toBe(address);
  });
});
