import { OrderMapper } from '../../../src/contexts/sales/infrastructure/persistence/order.mapper.js';
import { Order } from '../../../src/contexts/sales/domain/order/order.aggregate.js';
import { OrderFactory } from '../../../src/contexts/sales/domain/order/order.factory.js';
import { Prisma } from '../../../src/platform/prisma/generated/client.js';
import { ShippingAddress } from '../../../src/contexts/sales/domain/order/shipping-address.vo.js';
import { ADDRESS_DATA, ADDRESS } from '../../fakes/fixtures.js';

const item = (overrides: Record<string, unknown> = {}) => ({
  isbn: '9780306406157',
  quantity: 2,
  title: 'Clean Code',
  price: '33.335',
  currency: 'PEN' as const,
  ...overrides,
});

describe('OrderMapper', () => {
  describe('toCreate: del pedido a las filas de la base', () => {
    it('arma el pedido con el monto cobrado en texto y las líneas anidadas', () => {
      const order = OrderFactory.fromCart(
        'o-1',
        'c-1',
        [
          item(),
          item({
            isbn: '9780306406140',
            title: 'Otro',
            price: '10.00',
            quantity: 1,
          }),
        ],
        ADDRESS,
      );
      order.place();

      const data = OrderMapper.toCreate(order, '90.00', 'PEN');

      expect(data).toMatchObject({
        id: 'o-1',
        customerId: 'c-1',
        status: 'PLACED',
        chargedAmount: '90.00',
        currency: 'PEN',
      });
      expect(data.lines.create).toEqual([
        {
          isbn: '9780306406157',
          title: 'Clean Code',
          unitPrice: '33.335',
          currency: 'PEN',
          quantity: 2,
        },
        {
          isbn: '9780306406140',
          title: 'Otro',
          unitPrice: '10',
          currency: 'PEN',
          quantity: 1,
        },
      ]);
    });

    it('el precio unitario va como texto, sin pasar por number', () => {
      const order = OrderFactory.fromCart(
        'o-1',
        'c-1',
        [item({ price: '0.1', quantity: 3 })],
        ADDRESS,
      );
      order.place();

      const [line] = OrderMapper.toCreate(order, '1.00', 'PEN').lines
        .create as { unitPrice: unknown }[];

      expect(typeof line.unitPrice).toBe('string');
      expect(line.unitPrice).toBe('0.1');
    });
  });

  describe('toDomain: de las filas de la base al pedido', () => {
    const row = {
      id: 'o-1',
      customerId: 'c-1',
      status: 'PLACED' as const,
      chargedAmount: new Prisma.Decimal('90.00'),
      currency: 'PEN' as const,
      createdAt: new Date(),
      shipRecipient: null,
      shipPhone: null,
      shipLine1: null,
      shipDistrict: null,
      shipProvince: null,
      shipDepartment: null,
      shipReference: null,
      lines: [
        {
          orderId: 'o-1',
          isbn: '9780306406157',
          title: 'Clean Code',
          unitPrice: new Prisma.Decimal('33.335000'),
          currency: 'PEN' as const,
          quantity: 2,
        },
      ],
    };

    it('reconstruye un pedido confirmado con los precios exactos de la base', () => {
      const order = OrderMapper.toDomain(row);

      expect(order.status).toBe('PLACED');
      expect(order.customerId).toBe('c-1');
      expect(order.getLines()[0].unitPrice.amount.toString()).toBe('33.335');
      expect(order.getLines()[0].isbn.value).toBe('9780306406157');
      expect(order.pullEvents()).toEqual([]);
    });

    it('usa la moneda de cada línea', () => {
      const usd = {
        ...row,
        currency: 'USD' as const,
        lines: [{ ...row.lines[0], currency: 'USD' as const }],
      };
      expect(OrderMapper.toDomain(usd).currency).toBe('USD');
    });
  });
});

describe('OrderMapper: dirección de envío', () => {
  const address = ShippingAddress.create(ADDRESS_DATA);
  const placed = (shipping: ShippingAddress) => {
    const order = OrderFactory.fromCart('o-1', 'c-1', [item()], shipping);
    order.place();
    return order;
  };
  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'o-1',
      customerId: 'c-1',
      status: 'PLACED',
      chargedAmount: new Prisma.Decimal('90.00'),
      currency: 'PEN',
      createdAt: new Date(),
      shipRecipient: ADDRESS_DATA.recipient,
      shipPhone: ADDRESS_DATA.phone,
      shipLine1: ADDRESS_DATA.line1,
      shipDistrict: ADDRESS_DATA.district,
      shipProvince: ADDRESS_DATA.province,
      shipDepartment: ADDRESS_DATA.department,
      shipReference: ADDRESS_DATA.reference,
      lines: [
        {
          orderId: 'o-1',
          isbn: '9780306406157',
          title: 'Clean Code',
          unitPrice: new Prisma.Decimal('33.335000'),
          currency: 'PEN',
          quantity: 2,
        },
      ],
      ...overrides,
    }) as never;

  describe('toCreate', () => {
    it('lleva los siete campos de la dirección en sus columnas', () => {
      expect(
        OrderMapper.toCreate(placed(address), '90.00', 'PEN'),
      ).toMatchObject({
        shipRecipient: ADDRESS_DATA.recipient,
        shipPhone: ADDRESS_DATA.phone,
        shipLine1: ADDRESS_DATA.line1,
        shipDistrict: ADDRESS_DATA.district,
        shipProvince: ADDRESS_DATA.province,
        shipDepartment: ADDRESS_DATA.department,
        shipReference: ADDRESS_DATA.reference,
      });
    });

    it('sin referencia, la columna va en null', () => {
      const { reference: _omit, ...rest } = ADDRESS_DATA;
      const data = OrderMapper.toCreate(
        placed(ShippingAddress.create(rest)),
        '90.00',
        'PEN',
      );
      expect(data.shipReference).toBeNull();
    });

    it('un pedido sin dirección (uno leído de antes) deja todas las columnas en null', () => {
      const legacy = Order.restore({
        id: 'o-1',
        customerId: 'c-1',
        lines: placed(address).getLines(),
        shippingAddress: null,
      });
      const data = OrderMapper.toCreate(legacy, '90.00', 'PEN');
      expect(data).toMatchObject({
        shipRecipient: null,
        shipPhone: null,
        shipLine1: null,
        shipDistrict: null,
        shipProvince: null,
        shipDepartment: null,
        shipReference: null,
      });
    });
  });

  describe('toDomain', () => {
    it('reconstruye la dirección', () => {
      const order = OrderMapper.toDomain(row());
      expect(order.shippingAddress?.toJSON()).toEqual(ADDRESS_DATA);
    });

    it('con la referencia en null, la dirección no tiene referencia', () => {
      const order = OrderMapper.toDomain(row({ shipReference: null }));
      expect(order.shippingAddress?.reference).toBeNull();
    });

    it('un pedido anterior a la dirección (todas las columnas en null) da null', () => {
      const order = OrderMapper.toDomain(
        row({
          shipRecipient: null,
          shipPhone: null,
          shipLine1: null,
          shipDistrict: null,
          shipProvince: null,
          shipDepartment: null,
          shipReference: null,
        }),
      );
      expect(order.shippingAddress).toBeNull();
    });

    it('una referencia sola, sin los campos obligatorios, es un dato roto y no un pedido sin dirección', () => {
      const alone = row({
        shipRecipient: null,
        shipPhone: null,
        shipLine1: null,
        shipDistrict: null,
        shipProvince: null,
        shipDepartment: null,
        shipReference: 'solo la referencia',
      });
      expect(() => OrderMapper.toDomain(alone)).toThrow(/dirección/i);
    });

    it.each([
      'shipRecipient',
      'shipPhone',
      'shipLine1',
      'shipDistrict',
      'shipProvince',
      'shipDepartment',
    ])(
      'una dirección a medias (%s en null y el resto no) es un error, no un pedido sin dirección',
      (column) => {
        expect(() => OrderMapper.toDomain(row({ [column]: null }))).toThrow(
          /dirección/i,
        );
      },
    );
  });
});
