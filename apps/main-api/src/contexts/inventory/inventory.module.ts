import { Module } from '@nestjs/common';
import { ConfirmReservationConsumer } from './infrastructure/stock/confirm-reservation.consumer.js';
import { ReleaseStockHandler } from './infrastructure/stock/release-stock.handler.js';
import { ReserveStockHandler } from './infrastructure/stock/reserve-stock.handler.js';

@Module({
  providers: [
    ReserveStockHandler,
    ReleaseStockHandler,
    ConfirmReservationConsumer,
  ],
})
export class InventoryModule {}
