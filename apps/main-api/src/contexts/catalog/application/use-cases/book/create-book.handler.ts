import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Book } from '../../../domain/model/book/book.aggregate.js';
import { BookRepository } from '../../../domain/ports/book.repository.js';
import type { AdminBook } from './admin-book.js';
import { CreateBookCommand } from './create-book.command.js';

@CommandHandler(CreateBookCommand)
export class CreateBookHandler implements ICommandHandler<CreateBookCommand> {
  constructor(private readonly books: BookRepository) {}

  // Los datos se validan y normalizan en el dominio. El libro y su evento se guardan juntos, y un ISBN que ya existe es
  // ConflictError BOOK_ALREADY_EXISTS: lo decide el repositorio
  async execute({ book: data }: CreateBookCommand): Promise<AdminBook> {
    const book = Book.register(data);
    await this.books.save(book);
    return book.toView();
  }
}
