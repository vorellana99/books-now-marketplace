import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import {
  DomainError,
  NotFoundError,
} from '../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import type { AdminBook } from '../../application/book/admin-book.js';
import { UpdateBookCommand } from '../../application/book/update-book.command.js';
import { BookChanges } from '../../domain/book/book-changes.js';

@CommandHandler(UpdateBookCommand)
export class UpdateBookHandler implements ICommandHandler<UpdateBookCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({
    isbn: raw,
    changes: data,
  }: UpdateBookCommand): Promise<AdminBook> {
    const isbn = Isbn.create(raw).value;
    const changes = BookChanges.create(data);

    const book = await this.prisma.$transaction(async (tx) => {
      const current = await tx.book.findUnique({ where: { isbn } });
      if (!current) throw new NotFoundError('Book', isbn);
      if (
        changes.price?.currency &&
        changes.price.currency !== current.currency
      ) {
        throw new DomainError(
          'CURRENCY_CANNOT_CHANGE',
          `La moneda de un libro no se cambia: ${isbn} está en ${current.currency}`,
        );
      }
      // Solo se escriben las columnas que cambian: dos cambios simultáneos de campos distintos se conservan los dos
      return tx.book.update({
        where: { isbn },
        data: {
          ...(changes.title !== undefined && { title: changes.title }),
          ...(changes.author !== undefined && { author: changes.author }),
          ...(changes.price && { price: changes.price.amount }),
          ...(changes.active !== undefined && { active: changes.active }),
        },
      });
    });

    return {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      price: { amount: book.price.toFixed(2), currency: book.currency },
      active: book.active,
    };
  }
}
