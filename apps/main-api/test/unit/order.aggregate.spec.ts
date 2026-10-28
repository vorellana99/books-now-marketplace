import { OrderPlacedEvent } from '../../src/contracts/sales/order-placed.event.js';
import {
  MAX_UNITS_PER_BOOK,
  Order,
} from '../../src/contexts/sales/domain/order/order.aggregate.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { DomainError } from '../../src/shared-kernel/domain.errors.js';
import { Isbn } from '../../src/shared-kernel/isbn.vo.js';
import { ShippingAddress } from '../../src/contexts/sales/domain/order/shipping-address.vo.js';
import { ADDRESS_DATA } from '../fakes/fixtures.js';

const ISBN_A = Isbn.create('9780306406157');
const ISBN_B = Isbn.create('9780306406140');

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
};

const newOrder = () => new Order('o-1', 'c-1');

describe('Order', () => {
  describe('estado inicial', () => {
    it('nace en borrador, sin líneas ni eventos', () => {
      const order = newOrder();
      expect(order.id).toBe('o-1');
      expect(order.customerId).toBe('c-1');
      expect(order.status).toBe('DRAFT');
      expect(order.getLines()).toHaveLength(0);
      expect(order.pullEvents()).toEqual([]);
    });
  });

  describe('addBook', () => {
    it('agrega una línea con el título y el precio copiados (snapshot)', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 2);

      const [line] = order.getLines();
      expect(line.isbn.value).toBe('9780306406157');
      expect(line.title).toBe('Clean Code');
      expect(line.unitPrice.toFixed()).toBe('45.00');
      expect(line.quantity).toBe(2);
      expect(line.total().toFixed()).toBe('90.00');
    });

    it('suma en una sola línea las unidades del mismo libro', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 2);
      order.addBook(ISBN_B, 'Refactoring', Money.of('60.00'), 1);
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 3);

      expect(order.getLines()).toHaveLength(2);
      expect(order.getLines()[0].quantity).toBe(5);
      expect(order.getLines()[1].quantity).toBe(1);
    });

    it(`permite hasta ${MAX_UNITS_PER_BOOK} unidades del mismo libro`, () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 10);
      expect(order.getLines()[0].quantity).toBe(10);
    });

    it('rechaza más de 10 unidades en una sola línea', () => {
      expect(
        codeOf(() =>
          newOrder().addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 11),
        ),
      ).toBe('MAX_QUANTITY_EXCEEDED');
    });

    it('rechaza más de 10 unidades al sumar líneas repetidas y no cambia el pedido', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 6);

      expect(
        codeOf(() => order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 5)),
      ).toBe('MAX_QUANTITY_EXCEEDED');
      expect(order.getLines()[0].quantity).toBe(6);
    });

    it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rechaza la cantidad %s',
      (quantity) => {
        expect(
          codeOf(() =>
            newOrder().addBook(
              ISBN_A,
              'Clean Code',
              Money.of('45.00'),
              quantity,
            ),
          ),
        ).toBe('INVALID_QUANTITY');
      },
    );

    it('rechaza mezclar monedas y no cambia el pedido', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00', 'PEN'), 1);

      expect(
        codeOf(() =>
          order.addBook(ISBN_B, 'Refactoring', Money.of('15.00', 'USD'), 1),
        ),
      ).toBe('CURRENCY_MISMATCH');
      expect(order.getLines()).toHaveLength(1);
      expect(order.currency).toBe('PEN');
    });

    it('rechaza el mismo libro con otro precio', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 1);

      expect(
        codeOf(() => order.addBook(ISBN_A, 'Clean Code', Money.of('50.00'), 1)),
      ).toBe('PRICE_MISMATCH');
      expect(order.getLines()[0].quantity).toBe(1);
    });

    it('getLines devuelve una copia: modificarla no cambia el pedido', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('45.00'), 1);
      order.getLines().pop();
      expect(order.getLines()).toHaveLength(1);
    });
  });

  describe('subtotal', () => {
    it('suma precio × cantidad de cada línea', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('10.50'), 2);
      order.addBook(ISBN_B, 'Refactoring', Money.of('20.00'), 1);
      expect(order.subtotal().toFixed()).toBe('41.00');
    });

    it('conserva toda la precisión: se redondea una sola vez al final', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('33.335'), 3);
      expect(order.subtotal().amount.toString()).toBe('100.005');
      expect(order.subtotal().toFinal().toFixed()).toBe('100.01');
    });

    it('un pedido vacío vale cero', () => {
      expect(newOrder().subtotal().toFixed()).toBe('0.00');
    });

    it('usa la moneda del pedido', () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('10.00', 'USD'), 1);
      expect(order.currency).toBe('USD');
      expect(order.subtotal().currency).toBe('USD');
    });
  });

  describe('place', () => {
    const placedOrder = () => {
      const order = newOrder();
      order.addBook(ISBN_A, 'Clean Code', Money.of('33.335'), 3);
      order.addBook(ISBN_B, 'Refactoring', Money.of('20.00'), 1);
      return order;
    };

    it('pasa a PLACED y registra un OrderPlacedEvent', () => {
      const order = placedOrder();
      order.place();

      expect(order.status).toBe('PLACED');
      const events = order.pullEvents();
      expect(events).toHaveLength(1);
      const event = events[0] as OrderPlacedEvent;
      expect(event).toBeInstanceOf(OrderPlacedEvent);
      expect(event.orderId).toBe('o-1');
      expect(event.aggregateId).toBe('o-1');
      expect(event.customerId).toBe('c-1');
      expect(event.lines).toEqual([
        { isbn: '9780306406157', quantity: 3 },
        { isbn: '9780306406140', quantity: 1 },
      ]);
    });

    it('el subtotal del evento es texto con 2 decimales, redondeado al final', () => {
      const order = placedOrder(); // 100.005 + 20.00 = 120.005
      order.place();
      expect((order.pullEvents()[0] as OrderPlacedEvent).subtotal).toBe(
        '120.01',
      );
    });

    it('pullEvents entrega los eventos una sola vez', () => {
      const order = placedOrder();
      order.place();
      expect(order.pullEvents()).toHaveLength(1);
      expect(order.pullEvents()).toEqual([]);
    });

    it('rechaza un pedido sin líneas y no registra eventos', () => {
      const order = newOrder();
      expect(codeOf(() => order.place())).toBe('EMPTY_ORDER');
      expect(order.status).toBe('DRAFT');
      expect(order.pullEvents()).toEqual([]);
    });

    it('no se puede confirmar dos veces ni registrar dos eventos', () => {
      const order = placedOrder();
      order.place();
      expect(codeOf(() => order.place())).toBe('ORDER_ALREADY_PLACED');
      expect(order.pullEvents()).toHaveLength(1);
    });

    it('no admite más libros una vez confirmado', () => {
      const order = placedOrder();
      order.place();
      expect(
        codeOf(() =>
          order.addBook(ISBN_B, 'Refactoring', Money.of('20.00'), 1),
        ),
      ).toBe('ORDER_ALREADY_PLACED');
      expect(order.getLines()).toHaveLength(2);
    });
  });
});

describe('Order: dirección de envío', () => {
  const address = ShippingAddress.create(ADDRESS_DATA);

  it('un pedido nuevo puede llevar su dirección', () => {
    expect(new Order('o-1', 'c-1', address).shippingAddress).toBe(address);
  });

  it('sin dirección, la dirección es null', () => {
    expect(new Order('o-1', 'c-1').shippingAddress).toBeNull();
  });

  it('la dirección no cambia al confirmar el pedido', () => {
    const order = new Order('o-1', 'c-1', address);
    order.addBook(
      Isbn.create('9780306406157'),
      'Clean Code',
      Money.of('45.00'),
      1,
    );
    order.place();
    expect(order.shippingAddress).toBe(address);
  });
});
