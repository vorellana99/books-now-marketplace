import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { BookPrice } from '../../../../../contracts/catalog/get-book-price.query.js';
import { GetBooksPricesQuery } from '../../../../../contracts/catalog/get-books-prices.query.js';
import { BookCatalog } from '../../../domain/ports/book-catalog.js';

// Los precios de todo un carrito con una sola consulta (lo garantiza el puerto de lectura)
@QueryHandler(GetBooksPricesQuery)
export class GetBooksPricesHandler implements IQueryHandler<GetBooksPricesQuery> {
  constructor(private readonly catalog: BookCatalog) {}

  execute({ isbns }: GetBooksPricesQuery): Promise<BookPrice[]> {
    return this.catalog.pricesOf(isbns);
  }
}
