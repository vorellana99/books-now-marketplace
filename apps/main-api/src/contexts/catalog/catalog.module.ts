import { Module } from '@nestjs/common';
import { GetBookPriceHandler } from './infrastructure/book/get-book-price.handler.js';

@Module({
  providers: [GetBookPriceHandler],
})
export class CatalogModule {}
