import { Module } from '@nestjs/common';
import { AddStockHandler } from './infrastructure/stock/add-stock.handler.js';
import { AdminStockController } from './infrastructure/stock/admin-stock.controller.js';
import { ConfirmReservationConsumer } from './infrastructure/stock/confirm-reservation.consumer.js';
import { CreateStockItemConsumer } from './infrastructure/stock/create-stock-item.consumer.js';
import { PurgeReservationsJob } from './infrastructure/stock/purge-reservations.job.js';
import { ReleaseStockHandler } from './infrastructure/stock/release-stock.handler.js';
import { ReserveStockHandler } from './infrastructure/stock/reserve-stock.handler.js';

@Module({
  controllers: [AdminStockController],
  providers: [
    AddStockHandler,
    ReserveStockHandler,
    ReleaseStockHandler,
    ConfirmReservationConsumer,
    CreateStockItemConsumer,
    PurgeReservationsJob,
  ],
})
export class InventoryModule {}
