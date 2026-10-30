import { Command } from '@nestjs/cqrs';
import type { BookChangesData } from '../../../domain/book/book-changes.js';
import type { AdminBook } from './admin-book.js';

// Cambia datos, precio y/o estado de un libro en una sola operación (una desactivación junto a un cambio de precio se
// aplica entera o no se aplica). Los cambios llegan sin validar: el handler los valida con BookChanges.create.
// Falla con NotFoundError si el libro no existe, con CURRENCY_CANNOT_CHANGE si se pide otra moneda y con
// NOTHING_TO_UPDATE si no hay ningún cambio
export class UpdateBookCommand extends Command<AdminBook> {
  constructor(
    readonly isbn: string,
    readonly changes: BookChangesData,
  ) {
    super();
  }
}
