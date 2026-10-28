import {
  Injectable,
  Logger,
  Module,
  type INestApplication,
  type Type,
} from '@nestjs/common';
import type { DomainEvent } from '../../src/shared-kernel/domain-event.js';
import type {
  DbDeliveryContext,
  DbOutboxConsumer,
  DeliveryContext,
  ExternalOutboxConsumer,
} from '../../src/platform/outbox/outbox-consumer.js';
import { OutboxHandler } from '../../src/platform/outbox/outbox-handler.decorator.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { createTestApp } from './nest.js';

// Un evento cualquiera para probar el Outbox sin depender de los de negocio
export class ProbeEvent implements DomainEvent {
  readonly eventVersion = 1;
  readonly occurredOn = new Date();
  readonly aggregateId: string;
  constructor(
    readonly eventName: string,
    aggregateId: string,
    readonly note = '',
  ) {
    this.aggregateId = aggregateId;
  }
}

export interface ProbeCall {
  consumer: string;
  event: unknown;
  ctx: DeliveryContext;
  requestId: string | undefined; // el requestId que veía el consumidor mientras se ejecutaba
}

// Estado compartido de los consumidores de prueba. Cada test lo reinicia y le pone el comportamiento que necesita
export const probe = {
  calls: [] as ProbeCall[],
  // Se ejecuta dentro de cada entrega: puede esperar, comprobar algo o lanzar un error
  behavior: undefined as ((call: ProbeCall) => Promise<void>) | undefined,
  reset() {
    this.calls = [];
    this.behavior = undefined;
  },
};

async function record(
  consumer: string,
  event: unknown,
  ctx: DeliveryContext,
): Promise<void> {
  const call: ProbeCall = {
    consumer,
    event,
    ctx,
    requestId: RequestContext.requestId(),
  };
  probe.calls.push(call);
  // Este log debe llevar el requestId de la entrega, sin que el consumidor haga nada para ello
  new Logger('OutboxProbe').log(`consumidor ${consumer} recibió un evento`);
  await probe.behavior?.(call);
}

// Efecto de un consumidor `db` dentro de la transacción del relay: una fila identificable por evento e intento
async function dbEffect(ctx: DbDeliveryContext): Promise<void> {
  await ctx.tx.reservation.create({
    data: {
      orderId: ctx.eventId,
      isbn: String(ctx.attempt).padStart(13, '0'),
      quantity: 1,
    },
  });
}

@OutboxHandler()
@Injectable()
export class DbProbe implements DbOutboxConsumer<unknown> {
  readonly kind = 'db' as const;
  readonly name = 'test.db';
  readonly event = 'test.db.event';
  async handle(event: unknown, ctx: DbDeliveryContext): Promise<void> {
    await dbEffect(ctx);
    await record(this.name, event, ctx);
  }
}

@OutboxHandler()
@Injectable()
export class ExternalProbe implements ExternalOutboxConsumer<unknown> {
  readonly kind = 'external' as const;
  readonly name = 'test.external';
  readonly event = 'test.external.event';
  async handle(event: unknown, ctx: DeliveryContext): Promise<void> {
    await record(this.name, event, ctx);
  }
}

// Dos consumidores (uno de cada tipo) del mismo evento, para comprobar que se crea una entrega por consumidor
@OutboxHandler()
@Injectable()
export class SharedDbProbe implements DbOutboxConsumer<unknown> {
  readonly kind = 'db' as const;
  readonly name = 'test.shared-db';
  readonly event = 'test.shared.event';
  async handle(event: unknown, ctx: DbDeliveryContext): Promise<void> {
    await dbEffect(ctx);
    await record(this.name, event, ctx);
  }
}

@OutboxHandler()
@Injectable()
export class SharedExternalProbe implements ExternalOutboxConsumer<unknown> {
  readonly kind = 'external' as const;
  readonly name = 'test.shared-external';
  readonly event = 'test.shared.event';
  async handle(event: unknown, ctx: DeliveryContext): Promise<void> {
    await record(this.name, event, ctx);
  }
}

// Escucha el evento real de Ventas, para comprobar que guardar un pedido guarda también su evento y su entrega
@OutboxHandler()
@Injectable()
export class OrderPlacedProbe implements DbOutboxConsumer<unknown> {
  readonly kind = 'db' as const;
  readonly name = 'test.order-placed';
  readonly event = 'sales.order.placed';
  async handle(event: unknown, ctx: DbDeliveryContext): Promise<void> {
    await record(this.name, event, ctx);
  }
}

// Levanta la aplicación con el Outbox y solo los consumidores de prueba indicados
export function appWithProbes(...consumers: Type[]): Promise<INestApplication> {
  class ProbesModule {}
  Module({ providers: consumers })(ProbesModule);
  return createTestApp(OutboxModule, ProbesModule);
}

// Cuántas veces, en total, se ejecutó un consumidor de prueba para un evento
export const callsFor = (eventId: string): ProbeCall[] =>
  probe.calls.filter((c) => c.ctx.eventId === eventId);
