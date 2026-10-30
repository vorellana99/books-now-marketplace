import { Module } from '@nestjs/common';
import { AddStockHandler } from './application/use-cases/stock/add-stock.handler.js';
import { ConfirmReservationHandler } from './application/use-cases/stock/confirm-reservation.handler.js';
import { CreateStockItemHandler } from './application/use-cases/stock/create-stock-item.handler.js';
import { StockRepository } from './domain/ports/stock.repository.js';
import { PrismaStockRepository } from './infrastructure/persistence/prisma-stock.repository.js';
import { AdminStockController } from './interface/http/admin-stock.controller.js';
import { ConfirmReservationConsumer } from './interface/consumers/confirm-reservation.consumer.js';
import { CreateStockItemConsumer } from './interface/consumers/create-stock-item.consumer.js';
import { PurgeReservationsJob } from './application/jobs/purge-reservations.job.js';
import { ReleaseStockHandler } from './application/use-cases/stock/release-stock.handler.js';
import { ReserveStockHandler } from './application/use-cases/stock/reserve-stock.handler.js';

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
