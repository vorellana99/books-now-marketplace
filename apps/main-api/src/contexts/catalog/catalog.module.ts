import { Module } from '@nestjs/common';
import { OutboxModule } from '../../platform/outbox/outbox.module.js';
import { AdminBookController } from './infrastructure/book/admin-book.controller.js';
import { BookController } from './infrastructure/book/book.controller.js';
import { CreateBookHandler } from './infrastructure/book/create-book.handler.js';
import { GetBookPriceHandler } from './infrastructure/book/get-book-price.handler.js';
import { UpdateBookHandler } from './infrastructure/book/update-book.handler.js';
import { SearchBooksHandler } from './infrastructure/book/search-books.handler.js';

@Module({
  imports: [OutboxModule], // CreateBookHandler guarda el evento del libro con OutboxWriter
  controllers: [BookController, AdminBookController],
  providers: [
    GetBookPriceHandler,
    SearchBooksHandler,
    CreateBookHandler,
    UpdateBookHandler,
  ],
})
export class CatalogModule {}
