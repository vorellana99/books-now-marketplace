import { Query } from '@nestjs/cqrs';
import type { BookPage } from '../../domain/book/book-view.js';

// Las vistas son del dominio; se reexportan aquí para quien ya las importaba de este archivo
export type { BookItem, BookPage } from '../../domain/book/book-view.js';

// Busca en el catálogo, solo libros activos. Es de uso interno de Catálogo: Ventas pide precios con
// GetBookPriceQuery, que sí es un contrato
export class SearchBooksQuery extends Query<BookPage> {
  constructor(
    readonly q: string | undefined,
    readonly page: number,
    readonly pageSize: number,
  ) {
    super();
  }
}
