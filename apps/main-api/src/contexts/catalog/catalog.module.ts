import { Module } from '@nestjs/common';
import { OutboxModule } from '../../platform/outbox/outbox.module.js';
import { AdminBookController } from './infrastructure/http/admin-book.controller.js';
import { BookController } from './infrastructure/http/book.controller.js';
import { CreateBookHandler } from './application/use-cases/book/create-book.handler.js';
import { GetBookPriceHandler } from './application/use-cases/book/get-book-price.handler.js';
import { GetBooksPricesHandler } from './application/use-cases/book/get-books-prices.handler.js';
import { BookCatalog } from './domain/ports/book-catalog.js';
import { BookRepository } from './domain/ports/book.repository.js';
import { PrismaBookCatalog } from './infrastructure/persistence/prisma-book-catalog.js';
import { PrismaBookRepository } from './infrastructure/persistence/prisma-book.repository.js';
import { UpdateBookHandler } from './application/use-cases/book/update-book.handler.js';
import { SearchBooksHandler } from './application/use-cases/book/search-books.handler.js';

@Module({
  imports: [OutboxModule], // PrismaBookRepository guarda el evento del libro con OutboxWriter
  controllers: [BookController, AdminBookController],
  providers: [
    { provide: BookRepository, useClass: PrismaBookRepository },
    { provide: BookCatalog, useClass: PrismaBookCatalog },
    GetBookPriceHandler,
    GetBooksPricesHandler,
    SearchBooksHandler,
    CreateBookHandler,
    UpdateBookHandler,
  ],
})
export class CatalogModule {}
