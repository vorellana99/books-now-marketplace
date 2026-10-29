import { randomUUID } from 'node:crypto';
import type { CommandBus } from '@nestjs/cqrs';
import { ConfirmReservationCommand } from '../../../src/contexts/inventory/application/stock/confirm-reservation.command.js';
import { CreateStockItemCommand } from '../../../src/contexts/inventory/application/stock/create-stock-item.command.js';
import { ConfirmReservationConsumer } from '../../../src/contexts/inventory/infrastructure/consumers/confirm-reservation.consumer.js';
import { CreateStockItemConsumer } from '../../../src/contexts/inventory/infrastructure/consumers/create-stock-item.consumer.js';
import { BookCreatedEvent } from '../../../src/contracts/catalog/book-created.event.js';
import { OrderPlacedEvent } from '../../../src/contracts/sales/order-placed.event.js';
import type { Prisma } from '../../../src/platform/prisma/generated/client.js';
import { fromTransactionHandle } from '../../../src/platform/prisma/transaction-handle.js';

const tx = { marker: 'tx-del-relay' } as unknown as Prisma.TransactionClient;
const ctx = {
  tx,
  eventId: randomUUID(),
  occurredOn: new Date(),
  attempt: 1,
  correlationId: null,
};

function busSpy() {
  const execute = vi.fn(() => Promise.resolve(undefined));
  return { bus: { execute } as unknown as CommandBus, execute };
}

describe('ConfirmReservationConsumer: adaptador fino de OrderPlaced', () => {
  it('es un consumidor de tipo db, con el nombre y el evento de siempre', () => {
    const consumer = new ConfirmReservationConsumer(busSpy().bus);

    expect(consumer.kind).toBe('db');
    expect(consumer.name).toBe('inventory.confirm-reservation');
    expect(consumer.event).toBe('sales.order.placed');
  });

  it('envía ConfirmReservationCommand con el pedido y la transacción del relay como identificador opaco', async () => {
    const { bus, execute } = busSpy();
    const orderId = randomUUID();

    await new ConfirmReservationConsumer(bus).handle(
      { orderId } as unknown as OrderPlacedEvent,
      ctx,
    );

    expect(execute).toHaveBeenCalledTimes(1);
    const command = (
      execute.mock.calls[0] as unknown[]
    )[0] as ConfirmReservationCommand;
    expect(command).toBeInstanceOf(ConfirmReservationCommand);
    expect(command.orderId).toBe(orderId);
    expect(fromTransactionHandle(command.tx)).toBe(tx);
    // el identificador no deja ver la transacción
    expect(JSON.stringify(command)).not.toContain('tx-del-relay');
  });

  it('un error del comando sube hacia el relay (que reintenta)', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('falló')));
    const consumer = new ConfirmReservationConsumer({
      execute,
    } as unknown as CommandBus);

    await expect(
      consumer.handle(
        { orderId: randomUUID() } as unknown as OrderPlacedEvent,
        ctx,
      ),
    ).rejects.toThrow('falló');
  });
});

describe('CreateStockItemConsumer: adaptador fino de catalog.book.created', () => {
  it('es un consumidor de tipo db, con el nombre y el evento de siempre', () => {
    const consumer = new CreateStockItemConsumer(busSpy().bus);

    expect(consumer.kind).toBe('db');
    expect(consumer.name).toBe('inventory.create-stock-item');
    expect(consumer.event).toBe('catalog.book.created');
  });

  it('envía CreateStockItemCommand con el ISBN y la transacción del relay como identificador opaco', async () => {
    const { bus, execute } = busSpy();

    await new CreateStockItemConsumer(bus).handle(
      { isbn: '9780132350884' } as unknown as BookCreatedEvent,
      ctx,
    );

    const command = (
      execute.mock.calls[0] as unknown[]
    )[0] as CreateStockItemCommand;
    expect(command).toBeInstanceOf(CreateStockItemCommand);
    expect(command.isbn).toBe('9780132350884');
    expect(fromTransactionHandle(command.tx)).toBe(tx);
  });

  it('un error del comando sube hacia el relay', async () => {
    const execute = vi.fn(() => Promise.reject(new Error('ISBN inválido')));
    const consumer = new CreateStockItemConsumer({
      execute,
    } as unknown as CommandBus);

    await expect(
      consumer.handle({ isbn: 'x' } as unknown as BookCreatedEvent, ctx),
    ).rejects.toThrow('ISBN inválido');
  });
});
