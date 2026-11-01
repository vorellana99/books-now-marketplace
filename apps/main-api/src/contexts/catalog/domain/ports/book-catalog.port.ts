import type { BookPrice } from '../../../../contracts/catalog/get-book-price.query.js';
import type { BookPage } from '../model/book/book-view.js';

// El catálogo que se lee: solo libros activos. Es el lado de lectura; devuelve vistas, no agregados
export abstract class BookCatalog {
  // Busca en el título o el autor, sin distinguir mayúsculas; sin texto lista todo. Ordena por título y, con el mismo
  // título, por ISBN. Los comodines `%`, `_` y `\` se buscan como texto. El total es de toda la búsqueda
  abstract search(
    q: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<BookPage>;

  // NotFoundError si el libro no existe o está inactivo: para quien consulta es como si no existiera
  abstract priceOf(isbn: string): Promise<BookPrice>;

  // Los precios de varios libros con una sola consulta: uno por cada ISBN distinto, en el orden de su primera aparición.
  // NotFoundError, nombrando el primer ISBN según el orden pedido, si alguno no existe o está inactivo
  abstract pricesOf(isbns: string[]): Promise<BookPrice[]>;
}
