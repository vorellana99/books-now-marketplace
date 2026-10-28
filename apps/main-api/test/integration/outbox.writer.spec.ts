import type { INestApplication } from '@nestjs/common';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { OrderPlacedEvent } from '../../src/contracts/sales/order-placed.event.js';
import { Isbn } from '../../src/shared-kernel/isbn.vo.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { deliveryRows, outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import {
  DbProbe,
  ExternalProbe,
  ProbeEvent,
  SharedDbProbe,
  SharedExternalProbe,
  appWithProbes,
} from '../support/outbox-probes.js';
import { ADDRESS_PAYLOAD } from '../fakes/fixtures.js';

describe('OutboxWriter (PostgreSQL real)', () => {
  let app: INestApplication;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await appWithProbes(
      DbProbe,
      ExternalProbe,
      SharedDbProbe,
      SharedExternalProbe,
    );
    writer = app.get(OutboxWriter);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const append = (...events: ProbeEvent[]) =>
    prisma.$transaction((tx) => writer.append(tx, events));

  describe('qué guarda', () => {
    it('un evento con un consumidor: una fila en outbox y una entrega PENDING', async () => {
      const event = new ProbeEvent('test.db.event', 'agg-1');

      await append(event);

      const [row] = await outboxRows();
      expect(row).toMatchObject({
        event_name: 'test.db.event',
        event_version: 1,
        aggregate_id: 'agg-1',
      });
      expect(row.occurred_on.toISOString()).toBe(
        event.occurredOn.toISOString(),
      );
      const deliveries = await deliveryRows();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]).toMatchObject({
        event_id: row.id,
        consumer: 'test.db',
        status: 'PENDING',
        attempts: 0,
        locked_until: null,
        last_error: null,
      });
      expect(deliveries[0].next_attempt_at.getTime()).toBeLessThanOrEqual(
        Date.now() + 1000,
      );
    });

    it('crea una entrega por cada consumidor del evento', async () => {
      await append(new ProbeEvent('test.shared.event', 'agg-1'));

      const deliveries = await deliveryRows();
      expect(deliveries.map((d) => d.consumer).sort()).toEqual([
        'test.shared-db',
        'test.shared-external',
      ]);
      expect(new Set(deliveries.map((d) => d.event_id)).size).toBe(1);
    });

    it('el payload es JSON: la fecha es texto, y el aggregateId viaja dentro', async () => {
      const event = new ProbeEvent('test.db.event', 'agg-7', 'hola');

      await append(event);

      const [row] = await outboxRows();
      expect(row.payload).toEqual({
        eventName: 'test.db.event',
        eventVersion: 1,
        aggregateId: 'agg-7',
        occurredOn: event.occurredOn.toISOString(),
        note: 'hola',
      });
    });

    it('guarda los eventos reales del contrato con los montos como texto', async () => {
      // OrderPlaced no tiene consumidor de prueba: se comprueba con un evento cuyo nombre sí tiene
      const placed = new OrderPlacedEvent(
        'o-1',
        'c-1',
        '100.00',
        [{ isbn: '9780306406157', quantity: 2 }],
        ADDRESS_PAYLOAD,
      );
      Object.defineProperty(placed, 'eventName', { value: 'test.db.event' });

      await append(placed as unknown as ProbeEvent);

      const [row] = await outboxRows();
      expect(row.payload).toMatchObject({
        aggregateId: 'o-1',
        orderId: 'o-1',
        customerId: 'c-1',
        subtotal: '100.00',
        lines: [{ isbn: '9780306406157', quantity: 2 }],
      });
    });

    it('serializa los value objects del evento con su toJSON (ISBN, dinero)', async () => {
      // El evento real lleva textos, pero un valor con toJSON() debe guardarse como lo muestra su toJSON()
      const event = Object.assign(new ProbeEvent('test.db.event', 'agg-1'), {
        isbn: Isbn.create('978-0-306-40615-7'),
        total: Money.of('90'),
      });

      await append(event);

      const [row] = await outboxRows();
      expect(row.payload).toMatchObject({
        isbn: '9780306406157',
        total: { amount: '90.00', currency: 'PEN' },
      });
    });

    it('guarda varios eventos en el orden en que se pasan', async () => {
      await append(
        new ProbeEvent('test.db.event', 'agg-1', 'primero'),
        new ProbeEvent('test.db.event', 'agg-1', 'segundo'),
        new ProbeEvent('test.db.event', 'agg-1', 'tercero'),
      );

      const rows = await outboxRows(); // ordenadas por id (uuidv7: crecen con el tiempo)
      expect(rows.map((r) => r.payload.note)).toEqual([
        'primero',
        'segundo',
        'tercero',
      ]);
      expect(await deliveryRows()).toHaveLength(3);
    });

    it('un evento que nadie escucha no se guarda', async () => {
      await append(new ProbeEvent('evento.sin.consumidores', 'agg-1'));

      expect(await outboxRows()).toEqual([]);
      expect(await deliveryRows()).toEqual([]);
    });

    it('sin eventos no hace nada', async () => {
      await append();
      expect(await outboxRows()).toEqual([]);
    });
  });

  describe('correlationId', () => {
    it('guarda el requestId de la petición en curso, fuera del payload', async () => {
      await RequestContext.run('r-origen', () =>
        append(new ProbeEvent('test.db.event', 'agg-1')),
      );

      const [row] = await outboxRows();
      expect(row.correlation_id).toBe('r-origen');
      expect(row.payload).not.toHaveProperty('correlationId');
    });

    it('sin petición en curso queda en null', async () => {
      await append(new ProbeEvent('test.db.event', 'agg-1'));
      expect((await outboxRows())[0].correlation_id).toBeNull();
    });
  });

  describe('misma transacción que quien lo llama', () => {
    it('si la transacción se revierte, no queda evento ni entregas', async () => {
      await expect(
        prisma.$transaction(async (tx) => {
          await writer.append(tx, [
            new ProbeEvent('test.shared.event', 'agg-1'),
          ]);
          throw new Error('falló el guardado del pedido');
        }),
      ).rejects.toThrow('falló el guardado del pedido');

      expect(await outboxRows()).toEqual([]);
      expect(await deliveryRows()).toEqual([]);
    });

    it('no abre una transacción propia: nadie más ve el evento hasta que el llamador confirma', async () => {
      let seenWhileOpen = -1;

      await prisma.$transaction(async (tx) => {
        await writer.append(tx, [new ProbeEvent('test.db.event', 'agg-1')]);
        // otra conexión, mientras la transacción sigue abierta
        const [{ n }] = await query<{ n: string }>(
          'SELECT count(*) AS n FROM messaging.outbox',
        );
        seenWhileOpen = Number(n);
      });

      expect(seenWhileOpen).toBe(0);
      expect(await outboxRows()).toHaveLength(1);
    });

    it('el evento y los datos del llamador se confirman juntos', async () => {
      await prisma.$transaction(async (tx) => {
        await tx.stockItem.create({
          data: { isbn: '9780306406157', available: 5 },
        });
        await writer.append(tx, [new ProbeEvent('test.db.event', 'agg-1')]);
      });

      const [{ n }] = await query<{ n: string }>(
        'SELECT count(*) AS n FROM inventory.stock_items',
      );
      expect(Number(n)).toBe(1);
      expect(await outboxRows()).toHaveLength(1);
    });
  });
});
