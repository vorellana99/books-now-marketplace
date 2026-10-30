import type { BookCurrency } from './book-rules.js';

// Un libro como lo ve el catálogo público: lo básico, con el precio como texto de 2 decimales
export interface BookItem {
  isbn: string;
  title: string;
  author: string;
  price: { amount: string; currency: BookCurrency }; // "45.00": el monto viaja como texto
}

// Un libro como lo ve la administración: lo mismo que el catálogo, más si está activo (el catálogo público no muestra
// los inactivos, así que allí no hace falta)
export interface BookView extends BookItem {
  active: boolean;
}

export interface BookPage {
  items: BookItem[];
  page: number;
  pageSize: number;
  total: number; // de toda la búsqueda, no solo de esta página
}
