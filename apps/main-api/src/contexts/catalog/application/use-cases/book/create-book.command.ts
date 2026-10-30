import { Command } from '@nestjs/cqrs';
import type { NewBookData } from '../../../domain/book/new-book.js';
import type { AdminBook } from './admin-book.js';

// Da de alta un libro. Los datos llegan sin validar: el handler los normaliza y valida con NewBook.create. Devuelve el
// libro como lo muestra el catálogo. Falla con ConflictError BOOK_ALREADY_EXISTS si el ISBN ya existe
export class CreateBookCommand extends Command<AdminBook> {
  constructor(readonly book: NewBookData) {
    super();
  }
}
