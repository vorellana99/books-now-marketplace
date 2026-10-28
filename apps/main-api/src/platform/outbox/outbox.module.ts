import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { OutboxRegistry } from './outbox.registry.js';

// ScheduleModule se queda en AppModule: así los tests construyen este módulo sin intervalo
@Module({
  imports: [DiscoveryModule],
  providers: [OutboxRegistry],
  exports: [OutboxRegistry],
})
export class OutboxModule {}
