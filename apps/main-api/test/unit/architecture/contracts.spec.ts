import { GetBookPriceQuery } from '../../../src/contracts/catalog/get-book-price.query.js';
import { GetBooksPricesQuery } from '../../../src/contracts/catalog/get-books-prices.query.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../../src/contracts/inventory/stock.errors.js';
import { ReleaseStockCommand } from '../../../src/contracts/inventory/release-stock.command.js';
import { ReserveStockCommand } from '../../../src/contracts/inventory/reserve-stock.command.js';
import { OrderPlacedEvent } from '../../../src/contracts/sales/order-placed.event.js';
import { DomainError } from '../../../src/shared-kernel/domain.errors.js';

describe('contracts/sales: OrderPlacedEvent', () => {
  const address = {
    recipient: 'Ana Pérez',
    phone: '999888777',
    line1: 'Av. Larco 123',
    district: 'Miraflores',
    province: 'Lima',
    department: 'Lima',
    reference: null,
  };
  const event = new OrderPlacedEvent(
    'o-1',
    'c-1',
    '100.00',
    [{ isbn: '9780306406157', quantity: 2 }],
    address,
  );

  it('identifica el evento y su versión', () => {
    expect(event.eventName).toBe('sales.order.placed');
    expect(event.eventVersion).toBe(2);
  });

  it('usa el pedido como aggregateId', () => {
    expect(event.aggregateId).toBe('o-1');
  });

  it('viaja como JSON: el aggregateId y el subtotal en texto sobreviven', () => {
    const payload = JSON.parse(JSON.stringify(event));
    expect(payload).toMatchObject({
      eventName: 'sales.order.placed',
      eventVersion: 2,
      aggregateId: 'o-1',
      orderId: 'o-1',
      customerId: 'c-1',
      subtotal: '100.00',
      lines: [{ isbn: '9780306406157', quantity: 2 }],
      shippingAddress: address,
    });
    expect(typeof payload.occurredOn).toBe('string'); // la fecha llega como texto
  });

  it('la versión 2 agrega la dirección y conserva los campos de la versión 1', () => {
    const payload = JSON.parse(JSON.stringify(event));
    for (const field of ['orderId', 'customerId', 'subtotal', 'lines']) {
      expect(payload).toHaveProperty(field);
    }
    expect(
      Object.keys(payload.shippingAddress).sort((a, b) => a.localeCompare(b)),
    ).toEqual([
      'department',
      'district',
      'line1',
      'phone',
      'province',
      'recipient',
      'reference',
    ]);
  });
});

describe('contracts/catalog: GetBookPriceQuery', () => {
  it('lleva el ISBN pedido', () => {
    expect(new GetBookPriceQuery('9780306406157').isbn).toBe('9780306406157');
  });
});

describe('contracts/catalog: GetBooksPricesQuery', () => {
  it('lleva los ISBN pedidos, en su orden', () => {
    const isbns = ['9780306406157', '9780132350884'];
    expect(new GetBooksPricesQuery(isbns).isbns).toEqual(isbns);
  });
});

describe('contracts/inventory: comandos', () => {
  it('ReserveStockCommand lleva el pedido y sus líneas', () => {
    const lines = [{ isbn: '9780306406157', quantity: 1 }];
    const cmd = new ReserveStockCommand('o-1', lines);
    expect(cmd.orderId).toBe('o-1');
    expect(cmd.lines).toEqual(lines);
  });

  it('ReleaseStockCommand lleva solo el pedido', () => {
    expect(new ReleaseStockCommand('o-1').orderId).toBe('o-1');
  });
});

describe('contracts/inventory: errores de stock', () => {
  it('OutOfStockError es un DomainError con código OUT_OF_STOCK', () => {
    const e = new OutOfStockError('9780306406157');
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('OUT_OF_STOCK');
    expect(e.message).toContain('9780306406157');
  });

  it('StockItemNotFoundError es un DomainError con código STOCK_ITEM_NOT_FOUND', () => {
    const e = new StockItemNotFoundError('9780306406157');
    expect(e).toBeInstanceOf(DomainError);
    expect(e.code).toBe('STOCK_ITEM_NOT_FOUND');
    expect(e.message).toContain('9780306406157');
  });
});
