import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Isbn } from '../../../../../shared-kernel/isbn.vo.js';
import { BookChanges } from '../../../domain/book/book-changes.js';
import { BookRepository } from '../../../domain/ports/book.repository.js';
import type { AdminBook } from './admin-book.js';
import { UpdateBookCommand } from './update-book.command.js';

@CommandHandler(UpdateBookCommand)
export class UpdateBookHandler implements ICommandHandler<UpdateBookCommand> {
  constructor(private readonly books: BookRepository) {}

  async execute({
    isbn: raw,
    changes: data,
  }: UpdateBookCommand): Promise<AdminBook> {
    const isbn = Isbn.create(raw).value;
    // Valida todo antes de abrir nada: un cambio inválido junto a uno válido rechaza ambos
    const changes = BookChanges.create(data);
    // El repositorio carga el libro, el dominio aplica los cambios (y rechaza otra moneda) y se guarda solo lo que cambió
    const book = await this.books.update(isbn, (current) =>
      current.apply(changes),
    );
    return book.toView();
  }
}
