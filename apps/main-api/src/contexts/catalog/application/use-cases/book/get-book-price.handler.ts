import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetBookPriceQuery,
  type BookPrice,
} from '../../../../../contracts/catalog/get-book-price.query.js';
import { BookCatalog } from '../../../domain/ports/book-catalog.js';

// Es el contrato con otros contextos (`contracts/`): Ventas pide aquí el precio de un libro. Falla con NotFoundError si
// el libro no existe o está inactivo
@QueryHandler(GetBookPriceQuery)
export class GetBookPriceHandler implements IQueryHandler<GetBookPriceQuery> {
  constructor(private readonly catalog: BookCatalog) {}

  execute({ isbn }: GetBookPriceQuery): Promise<BookPrice> {
    return this.catalog.priceOf(isbn);
  }
}
