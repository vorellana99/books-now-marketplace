import { Logger } from '@nestjs/common';
import { SendOrderConfirmationConsumer } from '../../src/contexts/sales/application/order/send-order-confirmation.consumer.js';
import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { OrderPlacedEvent } from '../../src/contracts/sales/order-placed.event.js';
import type { DeliveryContext } from '../../src/platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../src/platform/outbox/outbox-handler.decorator.js';
import { FakeNotifier } from '../fakes/fake-notifier.js';
import { InMemoryCustomerRepository } from '../fakes/in-memory-customer-repository.js';
import { ADDRESS_PAYLOAD } from '../fakes/fixtures.js';

const ORDER = '0196a000-0000-7000-8000-0000000000aa';
const EVENT_ID = '0196a000-0000-7000-8000-0000000000bb';

const event = (customerId = 'c-1') =>
  new OrderPlacedEvent(
    ORDER,
    customerId,
    '100.00',
    [{ isbn: '9780306406157', quantity: 2 }],
    ADDRESS_PAYLOAD,
  );
const ctx = (overrides: Partial<DeliveryContext> = {}): DeliveryContext => ({
  eventId: EVENT_ID,
  occurredOn: new Date(),
  attempt: 1,
  correlationId: 'r-compra',
  ...overrides,
});

function setup(
  options: { customers?: Customer[]; notifierFails?: boolean } = {},
) {
  const customers = new InMemoryCustomerRepository(
    options.customers ?? [Customer.create('c-1', 'ana@example.com')],
  );
  const notifier = new FakeNotifier({ fails: options.notifierFails });
  return {
    notifier,
    consumer: new SendOrderConfirmationConsumer(customers, notifier),
  };
}

describe('SendOrderConfirmationConsumer', () => {
  afterEach(() => vi.restoreAllMocks());

  it('es un consumidor externo de sales.order.placed con nombre propio', () => {
    const { consumer } = setup();
    expect(consumer.kind).toBe('external');
    expect(consumer.name).toBe('sales.send-order-confirmation');
    expect(consumer.event).toBe('sales.order.placed');
  });

  it('envía el correo al email del cliente, mencionando el pedido', async () => {
    const { consumer, notifier } = setup();

    await consumer.handle(event(), ctx());

    expect(notifier.sent).toHaveLength(1);
    expect(notifier.sent[0].to).toBe('ana@example.com');
    expect(notifier.sent[0].message).toContain(ORDER);
  });

  it('usa el eventId como clave de idempotencia', async () => {
    const { consumer, notifier } = setup();
    await consumer.handle(event(), ctx());
    expect(notifier.sent[0].idempotencyKey).toBe(EVENT_ID);
  });

  it('un reintento de la misma entrega manda la misma clave, para que el proveedor lo descarte', async () => {
    const { consumer, notifier } = setup();
    await consumer.handle(event(), ctx({ attempt: 1 }));
    await consumer.handle(event(), ctx({ attempt: 2 }));
    expect(notifier.sent.map((s) => s.idempotencyKey)).toEqual([
      EVENT_ID,
      EVENT_ID,
    ]);
  });

  it('otro evento lleva otra clave', async () => {
    const { consumer, notifier } = setup();
    await consumer.handle(event(), ctx({ eventId: 'e-1' }));
    await consumer.handle(event(), ctx({ eventId: 'e-2' }));
    expect(notifier.sent.map((s) => s.idempotencyKey)).toEqual(['e-1', 'e-2']);
  });

  it('si el cliente ya no existe no envía nada y no falla (reintentar no lo arreglaría)', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { consumer, notifier } = setup({ customers: [] });

    await expect(consumer.handle(event('c-9'), ctx())).resolves.toBeUndefined();

    expect(notifier.sent).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(ORDER);
  });

  it('el aviso por falta de cliente no incluye ningún correo', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { consumer } = setup({ customers: [] });
    await consumer.handle(event('c-9'), ctx());
    expect(String(warn.mock.calls[0][0])).not.toContain('@');
  });

  it('si el proveedor falla, el error sube para que el relay reintente', async () => {
    const { consumer } = setup({ notifierFails: true });
    await expect(consumer.handle(event(), ctx())).rejects.toThrow(
      'El proveedor de email falló',
    );
  });

  it('lleva el decorador @OutboxHandler: así el relay lo descubre', () => {
    expect(
      Reflect.getMetadata(OutboxHandler.KEY, SendOrderConfirmationConsumer),
    ).toBeDefined();
  });
});
