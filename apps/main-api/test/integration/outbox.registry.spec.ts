import {
  Injectable,
  Module,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import { OutboxHandler } from '../../src/platform/outbox/outbox-handler.decorator.js';
import type {
  DbOutboxConsumer,
  ExternalOutboxConsumer,
} from '../../src/platform/outbox/outbox-consumer.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRegistry } from '../../src/platform/outbox/outbox.registry.js';
import { resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

// Consumidores de prueba: no hacen nada, solo se dejan descubrir
@OutboxHandler()
@Injectable()
class ConfirmReservation implements DbOutboxConsumer<unknown> {
  readonly kind = 'db' as const;
  readonly name = 'inventory.confirm-reservation';
  readonly event = 'sales.order.placed';
  async handle(): Promise<void> {}
}

@OutboxHandler()
@Injectable()
class SendConfirmation implements ExternalOutboxConsumer<unknown> {
  readonly kind = 'external' as const;
  readonly name = 'sales.send-order-confirmation';
  readonly event = 'sales.order.placed';
  async handle(): Promise<void> {}
}

@OutboxHandler()
@Injectable()
class OtherEventConsumer implements DbOutboxConsumer<unknown> {
  readonly kind = 'db' as const;
  readonly name = 'catalog.index-book';
  readonly event = 'catalog.book.created';
  async handle(): Promise<void> {}
}

@Injectable()
class NotAConsumer {
  readonly name = 'inventory.confirm-reservation'; // mismo nombre, pero sin @OutboxHandler()
}

// Construye un módulo con los consumidores dados y levanta la aplicación con el Outbox
function appWith(...consumers: Type[]): Promise<INestApplication> {
  class ConsumersModule {}
  Module({ providers: consumers })(ConsumersModule);
  return createTestApp(OutboxModule, ConsumersModule);
}

// Una clase decorada con un consumidor mal formado, para comprobar que el arranque lo rechaza
function malformed(fields: Record<string, unknown>): Type {
  @OutboxHandler()
  @Injectable()
  class Malformed {
    constructor() {
      Object.assign(this, fields);
    }
  }
  return Malformed;
}

describe('OutboxRegistry (descubre los consumidores con @OutboxHandler)', () => {
  let app: INestApplication | undefined;
  beforeEach(resetDatabase);
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('descubre los consumidores decorados y los devuelve por nombre', async () => {
    app = await appWith(ConfirmReservation, SendConfirmation);
    const registry = app.get(OutboxRegistry);

    expect(registry.get('inventory.confirm-reservation')).toBeInstanceOf(
      ConfirmReservation,
    );
    expect(registry.get('sales.send-order-confirmation')).toBeInstanceOf(
      SendConfirmation,
    );
  });

  it('acepta consumidores de tipo db y external', async () => {
    app = await appWith(ConfirmReservation, SendConfirmation);
    const registry = app.get(OutboxRegistry);

    expect(registry.get('inventory.confirm-reservation')?.kind).toBe('db');
    expect(registry.get('sales.send-order-confirmation')?.kind).toBe(
      'external',
    );
  });

  it('consumersOf devuelve los nombres de los consumidores de un evento', async () => {
    app = await appWith(
      ConfirmReservation,
      SendConfirmation,
      OtherEventConsumer,
    );
    const registry = app.get(OutboxRegistry);

    expect([...registry.consumersOf('sales.order.placed')].sort()).toEqual([
      'inventory.confirm-reservation',
      'sales.send-order-confirmation',
    ]);
    expect(registry.consumersOf('catalog.book.created')).toEqual([
      'catalog.index-book',
    ]);
  });

  it('un evento que nadie escucha da una lista vacía', async () => {
    app = await appWith(ConfirmReservation);
    expect(app.get(OutboxRegistry).consumersOf('evento.desconocido')).toEqual(
      [],
    );
  });

  it('un nombre desconocido da undefined', async () => {
    app = await appWith(ConfirmReservation);
    expect(app.get(OutboxRegistry).get('no.existe')).toBeUndefined();
  });

  it('sin consumidores, el registro arranca vacío', async () => {
    app = await appWith();
    const registry = app.get(OutboxRegistry);
    expect(registry.consumersOf('sales.order.placed')).toEqual([]);
    expect(registry.get('inventory.confirm-reservation')).toBeUndefined();
  });

  it('ignora los providers que no llevan @OutboxHandler()', async () => {
    app = await appWith(NotAConsumer);
    expect(
      app.get(OutboxRegistry).get('inventory.confirm-reservation'),
    ).toBeUndefined();
  });

  describe('rechaza al arrancar lo que estaría mal configurado', () => {
    @OutboxHandler()
    @Injectable()
    class DuplicateName implements DbOutboxConsumer<unknown> {
      readonly kind = 'db' as const;
      readonly name = 'inventory.confirm-reservation'; // el mismo nombre que ConfirmReservation
      readonly event = 'sales.order.placed';
      async handle(): Promise<void> {}
    }

    it('dos consumidores con el mismo nombre', async () => {
      await expect(appWith(ConfirmReservation, DuplicateName)).rejects.toThrow(
        /Consumidor duplicado: inventory\.confirm-reservation/,
      );
    });

    it.each([
      [
        'un tipo (kind) desconocido',
        { kind: 'otro', name: 'x.y', event: 'e.v' },
        /kind/,
      ],
      ['sin tipo (kind)', { name: 'x.y', event: 'e.v' }, /kind/],
      ['sin nombre', { kind: 'db', event: 'e.v' }, /name/],
      ['un nombre vacío', { kind: 'db', name: '', event: 'e.v' }, /name/],
      ['sin evento', { kind: 'db', name: 'x.y' }, /event/],
      ['sin handle()', { kind: 'db', name: 'x.y', event: 'e.v' }, /handle/],
    ])('un consumidor con %s', async (_caso, fields, message) => {
      await expect(appWith(malformed(fields))).rejects.toThrow(message);
    });
  });
});
