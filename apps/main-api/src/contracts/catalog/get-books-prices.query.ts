import { Query } from '@nestjs/cqrs';
import type { BookPrice } from './get-book-price.query.js';

// Los precios de varios libros con una sola consulta (el carrito de una compra o una cotización). Devuelve un libro por
// cada ISBN distinto, en el orden de su primera aparición. Falla con NotFoundError, nombrando el primer ISBN según el
// orden pedido, si alguno no existe o está inactivo
export class GetBooksPricesQuery extends Query<BookPrice[]> {
  constructor(readonly isbns: string[]) {
    super();
  }
}
