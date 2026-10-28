import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { CustomerRepository } from '../../src/contexts/sales/domain/customer/customer.repository.js';
import { CatalogPricing } from '../../src/contexts/sales/domain/order/catalog-pricing.port.js';
import { CheckoutLog } from '../../src/contexts/sales/domain/order/checkout-log.port.js';
import { Notifier } from '../../src/contexts/sales/domain/order/notifier.port.js';
import { Order } from '../../src/contexts/sales/domain/order/order.aggregate.js';
import { OrderFactory } from '../../src/contexts/sales/domain/order/order.factory.js';
import { OrderRepository } from '../../src/contexts/sales/domain/order/order.repository.js';
import { StockReservation } from '../../src/contexts/sales/domain/order/stock-reservation.port.js';
import { PaymentGateway } from '../../src/contexts/sales/domain/payment/payment-gateway.port.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutOfStockError } from '../../src/contracts/inventory/stock.errors.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';
import {
  FakeNotifier,
  FakePaymentGateway,
  FakeStockReservation,
  FixedCatalog,
  InMemoryCheckoutLog,
  InMemoryCustomerRepository,
  InMemoryOrderRepository,
  ISBN,
  customersWithPremium,
  fixedCatalog,
} from '../fakes/index.js';

const LINES = [{ isbn: ISBN, quantity: 2 }];
const order = (id = 'o-1') =>
  OrderFactory.fromCart(id, 'c-1', [
    {
      isbn: ISBN,
      quantity: 1,
      title: 'Libro',
      price: '100.00',
      currency: 'PEN',
    },
  ]);

describe('los fakes implementan los puertos del dominio', () => {
  it('son instancias de sus puertos', () => {
    expect(new FakeStockReservation()).toBeInstanceOf(StockReservation);
    expect(new FakePaymentGateway()).toBeInstanceOf(PaymentGateway);
    expect(new InMemoryCheckoutLog()).toBeInstanceOf(CheckoutLog);
    expect(new InMemoryOrderRepository()).toBeInstanceOf(OrderRepository);
    expect(new InMemoryCustomerRepository([])).toBeInstanceOf(
      CustomerRepository,
    );
    expect(fixedCatalog()).toBeInstanceOf(CatalogPricing);
    expect(new FakeNotifier()).toBeInstanceOf(Notifier);
  });
});

describe('FakeStockReservation', () => {
  it('registra lo que reserva', async () => {
    const stock = new FakeStockReservation();
    await stock.reserve('o-1', LINES);
    expect(stock.reserved).toEqual([{ orderId: 'o-1', lines: LINES }]);
  });

  it('lanza OutOfStockError para un ISBN sin stock y no reserva nada', async () => {
    const stock = new FakeStockReservation({ outOfStock: [ISBN] });
    await expect(stock.reserve('o-1', LINES)).rejects.toThrow(OutOfStockError);
    expect(stock.reserved).toEqual([]);
  });

  it('liberar devuelve la reserva una sola vez (idempotente)', async () => {
    const stock = new FakeStockReservation();
    await stock.reserve('o-1', LINES);
    await stock.release('o-1');
    await stock.release('o-1');
    expect(stock.released).toEqual(['o-1']);
    expect(stock.reserved).toEqual([]);
  });

  it('la liberación puede fallar, y la reserva sigue en pie', async () => {
    const stock = new FakeStockReservation({ releaseFails: true });
    await stock.reserve('o-1', LINES);

    await expect(stock.release('o-1')).rejects.toThrow(/liberación/i);
    expect(stock.released).toEqual([]);
    expect(stock.reserved).toHaveLength(1);
  });

  it('liberar un pedido sin reserva no hace nada', async () => {
    const stock = new FakeStockReservation();
    await stock.release('o-9');
    expect(stock.released).toEqual([]);
  });
});

describe('FakePaymentGateway', () => {
  const amount = Money.of('90.00');

  it('aprueba por defecto y registra el cobro', async () => {
    const payments = new FakePaymentGateway();
    await expect(payments.charge(amount, 'tok', 'o-1')).resolves.toEqual({
      approved: true,
    });
    expect(payments.charged).toEqual([
      { amount, cardToken: 'tok', orderId: 'o-1' },
    ]);
  });

  it('rechaza con el motivo indicado', async () => {
    const payments = new FakePaymentGateway({
      approved: false,
      reason: 'fondos insuficientes',
    });
    await expect(payments.charge(amount, 'tok', 'o-1')).resolves.toEqual({
      approved: false,
      reason: 'fondos insuficientes',
    });
  });

  it('un pago rechazado no cuenta como cobrado: reembolsarlo no hace nada', async () => {
    const payments = new FakePaymentGateway({
      approved: false,
      reason: 'sin fondos',
    });
    await payments.charge(amount, 'tok', 'o-1');

    expect(payments.charged).toEqual([]);
    expect(payments.attempts).toHaveLength(1); // pero el intento queda registrado
    await payments.refund('o-1');
    expect(payments.refunded).toEqual([]);
  });

  it('reembolsa solo lo cobrado y una sola vez (idempotente)', async () => {
    const payments = new FakePaymentGateway();
    await payments.charge(amount, 'tok', 'o-1');
    await payments.refund('o-1');
    await payments.refund('o-1');
    await payments.refund('o-sin-cobro');
    expect(payments.refunded).toEqual(['o-1']);
  });

  it('timeout: registra el cobro (pudo hacerse) y luego falla', async () => {
    const payments = new FakePaymentGateway({ timeout: true });
    await expect(payments.charge(amount, 'tok', 'o-1')).rejects.toThrow(
      /tiempo/i,
    );
    expect(payments.charged).toHaveLength(1);
    await payments.refund('o-1'); // sin esto, el cobro quedaría sin reembolsar
    expect(payments.refunded).toEqual(['o-1']);
  });

  it('el reembolso puede fallar', async () => {
    const payments = new FakePaymentGateway({ refundFails: true });
    await payments.charge(amount, 'tok', 'o-1');
    await expect(payments.refund('o-1')).rejects.toThrow(/reembolso/i);
    expect(payments.refunded).toEqual([]);
  });
});

describe('InMemoryCheckoutLog', () => {
  it('start devuelve false si la clave ya existe', async () => {
    const log = new InMemoryCheckoutLog();
    expect(await log.start('o-1', 'k-1', 'h')).toBe(true);
    expect(await log.start('o-2', 'k-1', 'h')).toBe(false);
  });

  it('un checkout nuevo está PENDING y se encuentra por su clave', async () => {
    const log = new InMemoryCheckoutLog();
    await log.start('o-1', 'k-1', 'hash-1');
    expect(log.statusOf('o-1')).toBe('PENDING');
    expect(await log.findByKey('k-1')).toEqual({
      orderId: 'o-1',
      status: 'PENDING',
      requestHash: 'hash-1',
      charged: null,
    });
    expect(await log.findByKey('otra')).toBeNull();
  });

  it('complete lo pasa a COMPLETED con el monto cobrado', async () => {
    const log = new InMemoryCheckoutLog();
    await log.start('o-1', 'k-1', 'h');
    log.complete('o-1', Money.of('90.00'));
    expect(await log.isCompleted('o-1')).toBe(true);
    expect((await log.findByKey('k-1'))?.charged?.toFixed()).toBe('90.00');
  });

  it('abort pasa PENDING a ABORTED pero nunca toca un COMPLETED', async () => {
    const log = new InMemoryCheckoutLog();
    await log.start('o-1', 'k-1', 'h');
    await log.start('o-2', 'k-2', 'h');
    log.complete('o-2', Money.of('10.00'));

    await log.abort('o-1');
    await log.abort('o-2');
    expect(log.statusOf('o-1')).toBe('ABORTED');
    expect(log.statusOf('o-2')).toBe('COMPLETED');
  });

  it('guarda el requestId de la petición en curso', async () => {
    const log = new InMemoryCheckoutLog();
    await RequestContext.run('r-test', () => log.start('o-1', 'k-1', 'h'));
    await log.start('o-2', 'k-2', 'h');
    log.backdate('o-1', 11);
    log.backdate('o-2', 11);
    const stale = await log.claimStale(10);
    expect(stale).toContainEqual({ orderId: 'o-1', requestId: 'r-test' });
    expect(stale).toContainEqual({ orderId: 'o-2', requestId: null });
  });

  it('claimStale solo reclama PENDING con más de N minutos', async () => {
    const log = new InMemoryCheckoutLog();
    await log.start('o-viejo', 'k-1', 'h');
    await log.start('o-nuevo', 'k-2', 'h');
    await log.start('o-listo', 'k-3', 'h');
    log.backdate('o-viejo', 11);
    log.backdate('o-listo', 11);
    log.complete('o-listo', Money.of('10.00'));

    const stale = await log.claimStale(10);
    expect(stale.map((s) => s.orderId)).toEqual(['o-viejo']);
  });

  it('dos reclamos seguidos no toman el mismo checkout', async () => {
    const log = new InMemoryCheckoutLog();
    await log.start('o-1', 'k-1', 'h');
    log.backdate('o-1', 11);
    expect(await log.claimStale(10)).toHaveLength(1);
    expect(await log.claimStale(10)).toHaveLength(0);
  });

  it('el reclamo vence y el checkout se puede retomar', async () => {
    let now = new Date('2026-10-27T10:00:00Z');
    const log = new InMemoryCheckoutLog(() => now);
    await log.start('o-1', 'k-1', 'h');
    now = new Date('2026-10-27T10:11:00Z');
    expect(await log.claimStale(10)).toHaveLength(1);
    expect(await log.claimStale(10)).toHaveLength(0);
    now = new Date('2026-10-27T10:17:00Z'); // pasó el bloqueo de 5 minutos
    expect(await log.claimStale(10)).toHaveLength(1);
  });
});

describe('InMemoryOrderRepository', () => {
  const placed = (id = 'o-1') => {
    const o = order(id);
    o.place();
    return o;
  };

  it('nextId entrega ids distintos', () => {
    const repo = new InMemoryOrderRepository();
    expect(repo.nextId()).not.toBe(repo.nextId());
  });

  it('save guarda el pedido, completa el checkout y conserva los eventos', async () => {
    const repo = new InMemoryOrderRepository();
    await repo.checkoutLog.start('o-1', 'k-1', 'h');

    await repo.save(placed(), Money.of('110.004'));

    expect(repo.count()).toBe(1);
    expect(await repo.findById('o-1')).toBeInstanceOf(Order);
    expect(await repo.findById('otro')).toBeNull();
    expect(await repo.checkoutLog.isCompleted('o-1')).toBe(true);
    expect((await repo.checkoutLog.findByKey('k-1'))?.charged?.toFixed()).toBe(
      '110.00',
    );
    expect(repo.eventsOf('o-1')).toHaveLength(1);
  });

  it('failOnSave: falla sin guardar nada ni completar el checkout', async () => {
    const repo = new InMemoryOrderRepository({ failOnSave: true });
    await repo.checkoutLog.start('o-1', 'k-1', 'h');

    await expect(repo.save(placed(), Money.of('110.00'))).rejects.toThrow();
    expect(repo.count()).toBe(0);
    expect(repo.checkoutLog.statusOf('o-1')).toBe('PENDING');
  });

  it('failAfterCommit: guarda y completa el checkout, y luego lanza (commit ambiguo)', async () => {
    const repo = new InMemoryOrderRepository({ failAfterCommit: true });
    await repo.checkoutLog.start('o-1', 'k-1', 'h');

    await expect(repo.save(placed(), Money.of('110.00'))).rejects.toThrow(
      /respuesta/i,
    );
    expect(repo.count()).toBe(1);
    expect(repo.checkoutLog.statusOf('o-1')).toBe('COMPLETED');
  });
});

describe('catálogo y clientes de prueba', () => {
  it('fixedCatalog valoriza el carrito con precios en texto', async () => {
    const priced = await fixedCatalog().priceCart([
      { isbn: ISBN, quantity: 3 },
    ]);
    expect(priced).toEqual([
      {
        isbn: ISBN,
        quantity: 3,
        title: 'Clean Code',
        price: '100.00',
        currency: 'PEN',
      },
    ]);
  });

  it('un ISBN que no está en el catálogo da NotFoundError', async () => {
    await expect(
      new FixedCatalog({}).priceCart([{ isbn: ISBN, quantity: 1 }]),
    ).rejects.toThrow(NotFoundError);
  });

  it('customersWithPremium trae a c-1 como premium', async () => {
    const customer = await customersWithPremium().findById('c-1');
    expect(customer).toBeInstanceOf(Customer);
    expect(customer?.isPremium).toBe(true);
    expect(await customersWithPremium().findById('nadie')).toBeNull();
  });
});

describe('FakeNotifier', () => {
  it('registra los mensajes con su clave de idempotencia', async () => {
    const notifier = new FakeNotifier();
    await notifier.send('ana@example.com', 'hola', { idempotencyKey: 'e-1' });
    await notifier.send('luis@example.com', 'chau');
    expect(notifier.sent).toEqual([
      { to: 'ana@example.com', message: 'hola', idempotencyKey: 'e-1' },
      { to: 'luis@example.com', message: 'chau', idempotencyKey: undefined },
    ]);
  });

  it('puede fallar para probar los reintentos', async () => {
    const notifier = new FakeNotifier({ fails: true });
    await expect(notifier.send('a@b.co', 'x')).rejects.toThrow();
    expect(notifier.sent).toEqual([]);
  });
});
