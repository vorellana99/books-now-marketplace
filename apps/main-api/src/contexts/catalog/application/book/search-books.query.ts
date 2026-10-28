import { Query } from '@nestjs/cqrs';

export interface BookItem {
  isbn: string;
  title: string;
  author: string;
  price: { amount: string; currency: 'PEN' | 'USD' }; // "45.00": el monto viaja como texto
}

export interface BookPage {
  items: BookItem[];
  page: number;
  pageSize: number;
  total: number; // de toda la búsqueda, no solo de esta página
}

// Lectura directa de la base, solo de libros activos. Es de uso interno de Catálogo: Ventas pide precios con
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
