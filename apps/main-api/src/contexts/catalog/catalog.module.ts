import { Module } from '@nestjs/common';
import { BookController } from './infrastructure/book/book.controller.js';
import { SearchBooksHandler } from './infrastructure/book/search-books.handler.js';
import { GetBookPriceHandler } from './infrastructure/book/get-book-price.handler.js';

@Module({
  controllers: [BookController],
  providers: [GetBookPriceHandler, SearchBooksHandler],
})
export class CatalogModule {}
