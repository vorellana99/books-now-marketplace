import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { ConfirmReservationConsumer } from '../../src/contexts/inventory/interface/consumers/confirm-reservation.consumer.js';
import { SendOrderConfirmationConsumer } from '../../src/contexts/sales/interface/consumers/send-order-confirmation.consumer.js';
import { CustomerRepository } from '../../src/contexts/sales/domain/ports/customer.repository.js';
import { Notifier } from '../../src/contexts/sales/domain/ports/notifier.port.js';
import { PrismaCustomerRepository } from '../../src/contexts/sales/infrastructure/persistence/prisma-customer.repository.js';
import { OrderPlacedEvent } from '../../src/contracts/sales/order-placed.event.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRegistry } from '../../src/platform/outbox/outbox.registry.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  deliveryRows,
  insertBook,
  insertCustomer,
  insertStock,
  makeDeliveriesDue,
  outboxRows,
  reservationsOf,
  stockOf,
} from '../support/builders.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { FakeNotifier } from '../fakes/fake-notifier.js';
import { InventoryInProcessAdapter } from '../../src/contexts/sales/infrastructure/adapters/inventory-in-process.adapter.js';
import { CommandBus } from '@nestjs/cqrs';
import { ADDRESS_PAYLOAD } from '../fakes/fixtures.js';

// Los dos consumidores de sales.order.placed, recibiendo el evento por el relay real
describe('Consumidores de sales.order.placed (relay y PostgreSQL reales)', () => {
  const notifier = new FakeNotifier();
  let failNotifier = false;
  const flaky = Object.assign(Object.create(notifier) as FakeNotifier, {
    send: (
      to: string,
      message: string,
      options?: { idempotencyKey?: string },
    ) =>
      failNotifier
        ? Promise.reject(new Error('proveedor caído'))
        : notifier.send(to, message, options),
  });

  @Module({
    providers: [
      SendOrderConfirmationConsumer,
      { provide: CustomerRepository, useClass: PrismaCustomerRepository },
      { provide: Notifier, useValue: flaky },
    ],
  })
  class SalesConsumers {}

  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, InventoryModule, SalesConsumers);
    relay = app.get(OutboxRelay);
    writer = app.get(OutboxWriter);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    notifier.sent.length = 0;
    failNotifier = false;
  });

  const publish = (orderId: string, customerId: string, isbn: string) =>
    prisma.$transaction((tx) =>
      writer.append(tx, [
        new OrderPlacedEvent(
          orderId,
          customerId,
          '100.00',
          [{ isbn, quantity: 1 }],
          {
            recipient: 'Ana',
            phone: '999888777',
            line1: 'Av. Larco 123',
            district: 'Miraflores',
            province: 'Lima',
            department: 'Lima',
            reference: null,
          },
        ),
      ]),
    );

  // Un pedido reservado (HELD) de un cliente real
  async function reserved(quantity = 2, email = 'ana@example.com') {
    const book = await insertBook();
    await insertStock(book.isbn, 10);
    const customer = await insertCustomer({ email });
    const orderId = randomUUID();
    await new InventoryInProcessAdapter(app.get(CommandBus)).reserve(orderId, [
      { isbn: book.isbn, quantity },
    ]);
    return { orderId, isbn: book.isbn, customer };
  }

  it('los dos consumidores quedan registrados para el evento', () => {
    const names = app
      .get(OutboxRegistry)
      .consumersOf('sales.order.placed')
      .sort((a, b) => a.localeCompare(b));
    expect(names).toEqual([
      'inventory.confirm-reservation',
      'sales.send-order-confirmation',
    ]);
  });

  describe('ConfirmReservationConsumer', () => {
    it('pasa la reserva HELD a CONFIRMED y la entrega a DONE', async () => {
      const { orderId, isbn, customer } = await reserved(2);
      await publish(orderId, customer.id, isbn);

      await relay.runOnce();

      expect(await reservationsOf(orderId)).toEqual([
        { isbn, quantity: 2, status: 'CONFIRMED' },
      ]);
      const deliveries = await deliveryRows();
      expect(
        deliveries.find((d) => d.consumer === 'inventory.confirm-reservation')
          ?.status,
      ).toBe('DONE');
    });

    it('no cambia el stock: lo reservado sigue reservado', async () => {
      const { orderId, isbn, customer } = await reserved(2);
      await publish(orderId, customer.id, isbn);
      await relay.runOnce();
      expect(await stockOf(isbn)).toEqual({ available: 8, reserved: 2 });
    });

    it('no toca las reservas de otros pedidos', async () => {
      const mine = await reserved(1);
      const other = await reserved(3, 'otro@example.com');
      await publish(mine.orderId, mine.customer.id, mine.isbn);

      await relay.runOnce();

      expect((await reservationsOf(other.orderId))[0].status).toBe('HELD');
    });

    it('si no hay reservas HELD para el pedido, no falla y la entrega queda DONE', async () => {
      const customer = await insertCustomer();
      await publish(randomUUID(), customer.id, '9780306406157');

      await relay.runOnce();

      const deliveries = await deliveryRows();
      expect(
        deliveries.find((d) => d.consumer === 'inventory.confirm-reservation')
          ?.status,
      ).toBe('DONE');
    });

    it('una reserva ya CONFIRMED se queda así al repetir la entrega', async () => {
      const { orderId, isbn, customer } = await reserved(1);
      const consumer = app.get(ConfirmReservationConsumer);
      const handle = () =>
        prisma.$transaction((tx) =>
          consumer.handle(
            new OrderPlacedEvent(
              orderId,
              customer.id,
              '1.00',
              [],
              ADDRESS_PAYLOAD,
            ),
            {
              tx,
              eventId: randomUUID(),
              occurredOn: new Date(),
              attempt: 1,
              correlationId: null,
            },
          ),
        );

      await handle();
      await handle();

      expect(await reservationsOf(orderId)).toEqual([
        { isbn, quantity: 1, status: 'CONFIRMED' },
      ]);
    });

    it('escribe en la transacción que recibe: si esa transacción se deshace, la reserva sigue HELD', async () => {
      const { orderId, isbn, customer } = await reserved(1);
      const consumer = app.get(ConfirmReservationConsumer);

      await prisma
        .$transaction(async (tx) => {
          await consumer.handle(
            new OrderPlacedEvent(
              orderId,
              customer.id,
              '1.00',
              [],
              ADDRESS_PAYLOAD,
            ),
            {
              tx,
              eventId: randomUUID(),
              occurredOn: new Date(),
              attempt: 1,
              correlationId: null,
            },
          );
          throw new Error('se deshace');
        })
        .catch(() => undefined);

      expect(await reservationsOf(orderId)).toEqual([
        { isbn, quantity: 1, status: 'HELD' },
      ]);
    });
  });

  // Un evento guardado antes de la versión 2 no trae dirección: los consumidores actuales deben seguir leyéndolo
  describe('un evento de la versión 1, sin dirección', () => {
    const publishV1 = (orderId: string, customerId: string, isbn: string) =>
      prisma.$transaction((tx) =>
        writer.append(tx, [
          {
            eventName: 'sales.order.placed',
            eventVersion: 1,
            occurredOn: new Date(),
            aggregateId: orderId,
            orderId,
            customerId,
            subtotal: '100.00',
            lines: [{ isbn, quantity: 1 }],
          } as never,
        ]),
      );

    it('confirma la reserva y envía el correo igual', async () => {
      const { orderId, isbn, customer } = await reserved(1);
      await publishV1(orderId, customer.id, isbn);
      const [event] = await outboxRows();

      await relay.runOnce();

      expect(event.event_version).toBe(1);
      expect(await reservationsOf(orderId)).toEqual([
        { isbn, quantity: 1, status: 'CONFIRMED' },
      ]);
      expect(notifier.sent).toHaveLength(1);
      expect(notifier.sent[0].to).toBe('ana@example.com');
    });
  });

  describe('SendOrderConfirmationConsumer', () => {
    it('envía el correo al cliente con el eventId como clave y deja la entrega DONE', async () => {
      const { orderId, isbn, customer } = await reserved();
      await publish(orderId, customer.id, isbn);
      const [event] = await outboxRows();

      await relay.runOnce();

      expect(notifier.sent).toHaveLength(1);
      expect(notifier.sent[0]).toMatchObject({
        to: 'ana@example.com',
        idempotencyKey: event.id,
      });
      expect(notifier.sent[0].message).toContain(orderId);
      const deliveries = await deliveryRows(event.id);
      expect(
        deliveries.find((d) => d.consumer === 'sales.send-order-confirmation')
          ?.status,
      ).toBe('DONE');
    });

    it('si el proveedor falla, la entrega se reintenta con la MISMA clave de idempotencia', async () => {
      const { orderId, isbn, customer } = await reserved();
      await publish(orderId, customer.id, isbn);
      const [event] = await outboxRows();

      failNotifier = true;
      await relay.runOnce();
      const failed = (await deliveryRows(event.id)).find(
        (d) => d.consumer === 'sales.send-order-confirmation',
      );
      expect(failed).toMatchObject({ status: 'PENDING', attempts: 1 });
      expect(failed?.last_error).toContain('proveedor caído');
      expect(notifier.sent).toEqual([]);

      failNotifier = false;
      await makeDeliveriesDue();
      await relay.runOnce();

      expect(notifier.sent).toHaveLength(1);
      expect(notifier.sent[0].idempotencyKey).toBe(event.id);
      // la confirmación de la reserva no se vio afectada por el fallo del correo
      expect((await reservationsOf(orderId))[0].status).toBe('CONFIRMED');
    });

    it('si el cliente no existe, no envía nada y la entrega queda DONE', async () => {
      const { orderId, isbn } = await reserved();
      await publish(orderId, randomUUID(), isbn);
      const [event] = await outboxRows();

      await relay.runOnce();

      expect(notifier.sent).toEqual([]);
      const deliveries = await deliveryRows(event.id);
      expect(
        deliveries.find((d) => d.consumer === 'sales.send-order-confirmation')
          ?.status,
      ).toBe('DONE');
    });
  });
});
