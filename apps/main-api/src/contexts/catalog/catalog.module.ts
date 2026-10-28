import { Module } from '@nestjs/common';
import { BookController } from './infrastructure/book/book.controller.js';
import { GetBookPriceHandler } from './infrastructure/book/get-book-price.handler.js';

@Module({
  controllers: [BookController],
  providers: [GetBookPriceHandler],
})
export class CatalogModule {}
