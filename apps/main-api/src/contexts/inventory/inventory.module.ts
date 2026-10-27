import { Module } from '@nestjs/common';
import { ReserveStockHandler } from './infrastructure/stock/reserve-stock.handler.js';

@Module({
  providers: [ReserveStockHandler],
})
export class InventoryModule {}
