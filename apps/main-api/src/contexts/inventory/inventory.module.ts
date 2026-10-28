import { Module } from '@nestjs/common';
import { ConfirmReservationConsumer } from './infrastructure/stock/confirm-reservation.consumer.js';
import { CreateStockItemConsumer } from './infrastructure/stock/create-stock-item.consumer.js';
import { ReleaseStockHandler } from './infrastructure/stock/release-stock.handler.js';
import { ReserveStockHandler } from './infrastructure/stock/reserve-stock.handler.js';

@Module({
  providers: [
    ReserveStockHandler,
    ReleaseStockHandler,
    ConfirmReservationConsumer,
    CreateStockItemConsumer,
  ],
})
export class InventoryModule {}
