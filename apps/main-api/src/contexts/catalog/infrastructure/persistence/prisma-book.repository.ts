import { Inject, Injectable } from '@nestjs/common';
import { OutboxWriter } from '../../../../platform/outbox/outbox.writer.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { isUniqueViolation } from '../../../../platform/prisma/unique-violation.js';
import {
  ConflictError,
  NotFoundError,
} from '../../../../shared-kernel/domain.errors.js';
import { Book } from '../../domain/model/book/book.aggregate.js';
import type { BookCurrency } from '../../domain/model/book/book-rules.js';
import type { BookUpdate } from '../../domain/model/book/book.aggregate.js';
import { BookRepository } from '../../domain/ports/book.repository.js';

interface BookRow {
  isbn: string;
  title: string;
  author: string;
  price: { toFixed(digits: number): string };
  currency: BookCurrency;
  active: boolean;
}

const toBook = (row: BookRow): Book =>
  Book.restore({
    isbn: row.isbn,
    title: row.title,
    author: row.author,
    price: { amount: row.price.toFixed(2), currency: row.currency },
    active: row.active,
  });

@Injectable()
export class PrismaBookRepository extends BookRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OutboxWriter) private readonly outbox: Pick<OutboxWriter, 'append'>,
  ) {
    super();
  }

  async save(book: Book): Promise<void> {
    const view = book.toView();
    const events = book.pullEvents();
    try {
      // El libro y su evento se confirman juntos: guardados por separado, una caída entre ambos dejaría un libro cuyo
      // stock nadie va a crear
      await this.prisma.$transaction(async (tx) => {
        await tx.book.create({
          data: {
            isbn: view.isbn,
            title: view.title,
            author: view.author,
            price: view.price.amount,
            currency: view.price.currency,
            active: view.active,
          },
        });
        await this.outbox.append(tx, events);
      });
    } catch (error) {
      // La clave primaria es la que decide, así que dos altas simultáneas del mismo ISBN no se pisan: una entra y la
      // otra recibe este error (mirar antes de insertar dejaría una carrera)
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'BOOK_ALREADY_EXISTS',
          `El libro ${view.isbn} ya existe`,
        );
      }
      throw error;
    }
  }

  async update(isbn: string, change: (book: Book) => void): Promise<Book> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.book.findUnique({ where: { isbn } });
      if (!current) throw new NotFoundError('Book', isbn);
      const book = toBook(current);
      change(book);
      const changes = book.changes();
      if (Object.keys(changes).length === 0) return book;
      // Solo se escriben las columnas que cambian: dos cambios simultáneos de campos distintos se conservan los dos
      const updated = await tx.book.update({
        where: { isbn },
        data: this.columnsOf(changes),
      });
      return toBook(updated);
    });
  }

  private columnsOf(changes: BookUpdate) {
    return {
      ...(changes.title !== undefined && { title: changes.title }),
      ...(changes.author !== undefined && { author: changes.author }),
      ...(changes.price && { price: changes.price.amount }),
      ...(changes.active !== undefined && { active: changes.active }),
    };
  }
}
