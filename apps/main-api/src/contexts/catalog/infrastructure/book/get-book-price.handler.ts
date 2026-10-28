import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import {
  GetBookPriceQuery,
  type BookPrice,
} from '../../../../contracts/catalog/get-book-price.query.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';

// Lectura directa con Prisma: las consultas no pasan por el dominio (lado de lectura de CQRS)
@QueryHandler(GetBookPriceQuery)
export class GetBookPriceHandler implements IQueryHandler<GetBookPriceQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ isbn }: GetBookPriceQuery): Promise<BookPrice> {
    const book = await this.prisma.book.findUnique({ where: { isbn } });
    // Un libro desactivado ya no se puede comprar: para quien consulta es como si no existiera
    if (!book?.active) throw new NotFoundError('Book', isbn);
    return {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      // Prisma.Decimal → texto con 2 decimales; el monto nunca pasa por number
      price: { amount: book.price.toFixed(2), currency: book.currency },
    };
  }
}
