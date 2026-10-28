import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import {
  SearchBooksQuery,
  type BookPage,
} from '../../application/book/search-books.query.js';

@QueryHandler(SearchBooksQuery)
export class SearchBooksHandler implements IQueryHandler<SearchBooksQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ q, page, pageSize }: SearchBooksQuery): Promise<BookPage> {
    // Prisma pasa el texto tal cual a ILIKE, donde % y _ son comodines y \ escapa: se escapan para buscarlos como texto
    const text = q?.trim().replace(/[\\%_]/g, '\\$&');
    const where = {
      active: true, // los desactivados no se muestran
      ...(text && {
        OR: [
          { title: { contains: text, mode: 'insensitive' as const } },
          { author: { contains: text, mode: 'insensitive' as const } },
        ],
      }),
    };
    // Una sola transacción: el total y la página salen de la misma foto de la tabla
    const [books, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({
        where,
        // El ISBN desempata: con títulos repetidos, ordenar solo por título puede repetir un libro en dos páginas
        // u omitirlo
        orderBy: [{ title: 'asc' }, { isbn: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.book.count({ where }),
    ]);
    return {
      items: books.map((b) => ({
        isbn: b.isbn,
        title: b.title,
        author: b.author,
        price: { amount: b.price.toFixed(2), currency: b.currency },
      })),
      page,
      pageSize,
      total,
    };
  }
}
