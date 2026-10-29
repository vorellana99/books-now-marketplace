import { Module } from '@nestjs/common';
import { AddStockHandler } from './application/stock/add-stock.handler.js';
import { ConfirmReservationHandler } from './application/stock/confirm-reservation.handler.js';
import { CreateStockItemHandler } from './application/stock/create-stock-item.handler.js';
import { StockRepository } from './domain/ports/stock.repository.js';
import { PrismaStockRepository } from './infrastructure/persistence/prisma-stock.repository.js';
import { AdminStockController } from './infrastructure/http/admin-stock.controller.js';
import { ConfirmReservationConsumer } from './infrastructure/consumers/confirm-reservation.consumer.js';
import { CreateStockItemConsumer } from './infrastructure/consumers/create-stock-item.consumer.js';
import { PurgeReservationsJob } from './application/stock/purge-reservations.job.js';
import { ReleaseStockHandler } from './application/stock/release-stock.handler.js';
import { ReserveStockHandler } from './application/stock/reserve-stock.handler.js';

@Module({
  controllers: [AdminStockController],
  providers: [
    { provide: StockRepository, useClass: PrismaStockRepository },
    AddStockHandler,
    ReserveStockHandler,
    ReleaseStockHandler,
    ConfirmReservationHandler,
    CreateStockItemHandler,
    ConfirmReservationConsumer,
    CreateStockItemConsumer,
    PurgeReservationsJob,
  ],
})
export class InventoryModule {}
