import { DiscoveryService } from '@nestjs/core';

// Marca una clase como consumidor del Outbox: OutboxRegistry la descubre sin que nadie la registre a mano
export const OutboxHandler = DiscoveryService.createDecorator();
