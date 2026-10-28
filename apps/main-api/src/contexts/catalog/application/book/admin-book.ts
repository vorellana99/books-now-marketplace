import type { BookItem } from './search-books.query.js';

// Un libro como lo ve la administración: lo mismo que el catálogo, más si está activo (el catálogo público no muestra
// los inactivos, así que allí no hace falta)
export interface AdminBook extends BookItem {
  active: boolean;
}
