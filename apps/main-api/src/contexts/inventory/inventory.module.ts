import { Module } from '@nestjs/common';
import { ReleaseStockHandler } from './infrastructure/stock/release-stock.handler.js';
import { ReserveStockHandler } from './infrastructure/stock/reserve-stock.handler.js';

@Module({
  providers: [ReserveStockHandler, ReleaseStockHandler],
})
export class InventoryModule {}
