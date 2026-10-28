import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { OutboxConsumer } from './outbox-consumer.js';
import { OutboxHandler } from './outbox-handler.decorator.js';

@Injectable()
export class OutboxRegistry implements OnModuleInit {
  private readonly byName = new Map<string, OutboxConsumer<unknown>>();
  private readonly byEvent = new Map<string, string[]>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const { instance, name: provider } of this.discovery.getProviders({
      metadataKey: OutboxHandler.KEY,
    })) {
      const consumer = instance as OutboxConsumer<unknown>;
      assertWellFormed(consumer, String(provider));
      if (this.byName.has(consumer.name)) {
        throw new Error(`Consumidor duplicado: ${consumer.name}`);
      }
      this.byName.set(consumer.name, consumer);
      this.byEvent.set(consumer.event, [
        ...(this.byEvent.get(consumer.event) ?? []),
        consumer.name,
      ]);
    }
  }

  consumersOf(eventName: string): string[] {
    return this.byEvent.get(eventName) ?? [];
  }

  get(name: string): OutboxConsumer<unknown> | undefined {
    return this.byName.get(name);
  }
}

// Un consumidor mal formado se detecta al arrancar, no cuando llega su primer evento
function assertWellFormed(
  consumer: Partial<OutboxConsumer<unknown>>,
  provider: string,
): void {
  const problem =
    consumer.kind !== 'db' && consumer.kind !== 'external'
      ? "su 'kind' debe ser 'db' o 'external'"
      : !consumer.name
        ? "falta su 'name'"
        : !consumer.event
          ? "falta su 'event'"
          : typeof consumer.handle !== 'function'
            ? 'falta su método handle()'
            : undefined;
  if (problem)
    throw new Error(
      `Consumidor del Outbox mal formado (${provider}): ${problem}`,
    );
}
