import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CreateBookCommand } from '../../src/contexts/catalog/application/book/create-book.command.js';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { CreateStockItemConsumer } from '../../src/contexts/inventory/infrastructure/stock/create-stock-item.consumer.js';
import { InventoryModule } from '../../src/contexts/inventory/inventory.module.js';
import { ReserveStockCommand } from '../../src/contracts/inventory/reserve-stock.command.js';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import { BookCreatedEvent } from '../../src/contracts/catalog/book-created.event.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRegistry } from '../../src/platform/outbox/outbox.registry.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  deliveryRows,
  insertBook,
  insertStock,
  makeDeliveriesDue,
  outboxRows,
  stockOf,
} from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

const bookData = (isbn = '9780132350884') => ({
  isbn,
  title: 'Clean Code',
  author: 'Robert C. Martin',
  price: { amount: '45.00', currency: 'PEN' as const },
});

describe('CreateStockItemConsumer: el stock en cero de un libro nuevo (relay y PostgreSQL reales)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let commandBus: CommandBus;
  let prisma: PrismaService;
  let writer: OutboxWriter;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, CatalogModule, InventoryModule);
    relay = app.get(OutboxRelay);
    commandBus = app.get(CommandBus);
    prisma = app.get(PrismaService);
    writer = app.get(OutboxWriter);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const createBook = (isbn?: string) =>
    commandBus.execute(new CreateBookCommand(bookData(isbn)));
  const reserve = (isbn: string, quantity = 1) =>
    commandBus.execute(
      new ReserveStockCommand(randomUUID(), [{ isbn, quantity }]),
    );
  const stockRows = () =>
    query<{ isbn: string; available: number; reserved: number }>(
      'SELECT isbn, available, reserved FROM inventory.stock_items ORDER BY isbn',
    );
  // Entrega el evento al consumidor directamente, dentro de una transacción, como lo haría el relay
  const deliver = (isbn: string, fail = false) =>
    prisma.$transaction(async (tx) => {
      await app
        .get(CreateStockItemConsumer)
        .handle(new BookCreatedEvent(isbn), {
          tx,
          eventId: randomUUID(),
          occurredOn: new Date(),
          attempt: 1,
          correlationId: null,
        });
      if (fail) throw new Error('se deshace');
    });

  it('es un consumidor db de catalog.book.created, registrado en el relay', () => {
    expect(app.get(OutboxRegistry).consumersOf('catalog.book.created')).toEqual(
      ['inventory.create-stock-item'],
    );
    const consumer = app.get(CreateStockItemConsumer);
    expect(consumer).toMatchObject({
      kind: 'db',
      name: 'inventory.create-stock-item',
      event: 'catalog.book.created',
    });
  });

  describe('al crear un libro', () => {
    it('el relay le crea el registro de stock en cero y deja la entrega DONE', async () => {
      await createBook();
      expect(await stockRows()).toEqual([]); // todavía no: lo hace el relay

      await relay.runOnce();

      expect(await stockRows()).toEqual([
        { isbn: '9780132350884', available: 0, reserved: 0 },
      ]);
      const [event] = await outboxRows();
      expect((await deliveryRows(event.id)).map((d) => d.status)).toEqual([
        'DONE',
      ]);
    });

    it('cada libro tiene su registro, y solo el suyo', async () => {
      await createBook('9780132350884');
      await createBook('9780306406157');

      await relay.runOnce();

      expect((await stockRows()).map((r) => r.isbn)).toEqual([
        '9780132350884',
        '9780306406157',
      ]);
    });

    it('un libro nuevo no se puede comprar: antes del evento, STOCK_ITEM_NOT_FOUND; después, OUT_OF_STOCK', async () => {
      await createBook();
      await expect(reserve('9780132350884')).rejects.toBeInstanceOf(
        StockItemNotFoundError,
      );

      await relay.runOnce();

      await expect(reserve('9780132350884')).rejects.toBeInstanceOf(
        OutOfStockError,
      );
    });

    it('cuando se le cargan unidades, se puede reservar', async () => {
      await createBook();
      await relay.runOnce();

      await query(
        "UPDATE inventory.stock_items SET available = 3 WHERE isbn = '9780132350884'",
      );

      await expect(reserve('9780132350884', 2)).resolves.toBeUndefined();
      expect(await stockOf('9780132350884')).toEqual({
        available: 1,
        reserved: 2,
      });
    });
  });

  describe('repetir la entrega no hace daño', () => {
    it('una segunda entrega del mismo evento no falla y no cambia el registro', async () => {
      await deliver('9780132350884');
      await expect(deliver('9780132350884')).resolves.toBeUndefined();
      expect(await stockRows()).toEqual([
        { isbn: '9780132350884', available: 0, reserved: 0 },
      ]);
    });

    it('no pisa el stock de un libro que ya lo tiene (por ejemplo, uno cargado antes)', async () => {
      const existing = await insertBook({ isbn: '9780132350884' });
      await insertStock(existing.isbn, 7, 2);

      await deliver(existing.isbn);

      expect(await stockOf(existing.isbn)).toEqual({
        available: 7,
        reserved: 2,
      });
    });

    it('no toca el stock de otros libros', async () => {
      const other = await insertBook();
      await insertStock(other.isbn, 5);

      await deliver('9780132350884');

      expect(await stockOf(other.isbn)).toEqual({ available: 5, reserved: 0 });
      expect(await stockRows()).toHaveLength(2);
    });

    it('dos entregas simultáneas del mismo evento dejan un solo registro', async () => {
      await Promise.all([
        deliver('9780132350884'),
        deliver('9780132350884'),
        deliver('9780132350884'),
      ]);
      expect(await stockRows()).toHaveLength(1);
    });
  });

  describe('usa la transacción que recibe', () => {
    it('si esa transacción se deshace, el registro no queda', async () => {
      await deliver('9780132350884', true).catch(() => undefined);
      expect(await stockRows()).toEqual([]);
    });
  });

  describe('un evento mal formado', () => {
    it('con un ISBN inválido falla (el relay reintenta) y no crea nada', async () => {
      await prisma.$transaction((tx) =>
        writer.append(tx, [new BookCreatedEvent('no-es-un-isbn')]),
      );

      await relay.runOnce();

      expect(await stockRows()).toEqual([]);
      const [event] = await outboxRows();
      const [delivery] = await deliveryRows(event.id);
      expect(delivery).toMatchObject({ status: 'PENDING', attempts: 1 });
      expect(delivery.last_error).toMatch(/isbn/i);
    });

    it('un reintento posterior de un evento bueno sí crea el registro', async () => {
      await createBook();
      // simula una primera entrega fallida: la vuelta del relay no llegó a confirmar
      await query(
        "UPDATE messaging.deliveries SET attempts = 1, last_error = 'caída'",
      );
      await makeDeliveriesDue();

      await relay.runOnce();

      expect(await stockRows()).toHaveLength(1);
    });
  });

  it('un libro creado antes de existir el consumidor (su registro ya está) no se ve afectado por su evento', async () => {
    await createBook();
    await query(
      "INSERT INTO inventory.stock_items (isbn, available, reserved) VALUES ('9780132350884', 4, 0)",
    );

    await relay.runOnce();

    expect(await stockOf('9780132350884')).toEqual({
      available: 4,
      reserved: 0,
    });
  });
});
