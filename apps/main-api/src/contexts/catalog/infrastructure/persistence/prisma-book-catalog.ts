import { Injectable } from '@nestjs/common';
import type { BookPrice } from '../../../../contracts/catalog/get-book-price.query.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import type { BookPage } from '../../domain/book/book-view.js';
import { BookCatalog } from '../../domain/ports/book-catalog.js';

@Injectable()
export class PrismaBookCatalog extends BookCatalog {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async search(
    q: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<BookPage> {
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

  async priceOf(isbn: string): Promise<BookPrice> {
    const book = await this.prisma.book.findUnique({ where: { isbn } });
    // Un libro desactivado ya no se puede comprar: para quien consulta es como si no existiera
    if (!book?.active) throw new NotFoundError('Book', isbn);
    return this.toPrice(book);
  }

  // Una sola consulta para todos los ISBN: cotizar 100 líneas no son 100 consultas
  async pricesOf(isbns: string[]): Promise<BookPrice[]> {
    const distinct = [...new Set(isbns)];
    if (distinct.length === 0) return [];
    const books = await this.prisma.book.findMany({
      where: { isbn: { in: distinct } },
    });
    const byIsbn = new Map(books.map((b) => [b.isbn, b]));
    return distinct.map((isbn) => {
      const book = byIsbn.get(isbn);
      // Se recorre en el orden pedido, así el error nombra siempre el primero que falla, no el que la base devuelva antes
      if (!book?.active) throw new NotFoundError('Book', isbn);
      return this.toPrice(book);
    });
  }

  private toPrice(book: {
    isbn: string;
    title: string;
    author: string;
    price: { toFixed(digits: number): string };
    currency: 'PEN' | 'USD';
  }): BookPrice {
    return {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      // Prisma.Decimal → texto con 2 decimales; el monto nunca pasa por number
      price: { amount: book.price.toFixed(2), currency: book.currency },
    };
  }
}
