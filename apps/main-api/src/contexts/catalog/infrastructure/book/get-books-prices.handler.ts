import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import type { BookPrice } from '../../../../contracts/catalog/get-book-price.query.js';
import { GetBooksPricesQuery } from '../../../../contracts/catalog/get-books-prices.query.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';

// Lectura directa con Prisma, como `GetBookPriceHandler`, pero con una sola consulta para todo el carrito: cotizar 100
// líneas no son 100 consultas
@QueryHandler(GetBooksPricesQuery)
export class GetBooksPricesHandler implements IQueryHandler<GetBooksPricesQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ isbns }: GetBooksPricesQuery): Promise<BookPrice[]> {
    const distinct = [...new Set(isbns)];
    if (distinct.length === 0) return [];
    const books = await this.prisma.book.findMany({
      where: { isbn: { in: distinct } },
    });
    const byIsbn = new Map(books.map((b) => [b.isbn, b]));
    return distinct.map((isbn) => {
      const book = byIsbn.get(isbn);
      // Un libro desactivado ya no se puede comprar: para quien consulta es como si no existiera. Se recorre en el
      // orden pedido, así el error nombra siempre el primero que falla, no el que la base devuelva antes
      if (!book?.active) throw new NotFoundError('Book', isbn);
      return {
        isbn: book.isbn,
        title: book.title,
        author: book.author,
        // Prisma.Decimal → texto con 2 decimales; el monto nunca pasa por number
        price: { amount: book.price.toFixed(2), currency: book.currency },
      };
    });
  }
}
