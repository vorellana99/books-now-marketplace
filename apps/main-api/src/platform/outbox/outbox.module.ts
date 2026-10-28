import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OutboxRegistry } from './outbox.registry.js';
import { OutboxRelay } from './outbox.relay.js';
import { OutboxWriter } from './outbox.writer.js';

// ScheduleModule se queda en AppModule: así los tests construyen este módulo sin intervalo
@Module({
  imports: [DiscoveryModule],
  providers: [OutboxRegistry, OutboxWriter, OutboxRelay],
  exports: [OutboxRegistry, OutboxWriter, OutboxRelay],
})
export class OutboxModule {}
