import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { BookCreatedEvent } from '../../../../contracts/catalog/book-created.event.js';
import { OutboxWriter } from '../../../../platform/outbox/outbox.writer.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { ConflictError } from '../../../../shared-kernel/domain.errors.js';
import { CreateBookCommand } from '../../application/book/create-book.command.js';
import type { AdminBook } from '../../application/book/admin-book.js';
import { NewBook } from '../../domain/book/new-book.js';
import { isUniqueViolation } from '../../../../platform/prisma/unique-violation.js';

@CommandHandler(CreateBookCommand)
export class CreateBookHandler implements ICommandHandler<CreateBookCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter,
  ) {}

  async execute({ book: data }: CreateBookCommand): Promise<AdminBook> {
    const book = NewBook.create(data);
    try {
      // El libro y su evento se confirman juntos: guardados por separado, una caída entre ambos dejaría un libro cuyo
      // stock nadie va a crear
      await this.prisma.$transaction(async (tx) => {
        await tx.book.create({
          data: {
            isbn: book.isbn,
            title: book.title,
            author: book.author,
            price: book.price.amount,
            currency: book.price.currency,
            active: true,
          },
        });
        await this.outbox.append(tx, [new BookCreatedEvent(book.isbn)]);
      });
    } catch (error) {
      // La clave primaria es la que decide, así que dos altas simultáneas del mismo ISBN no se pisan: una entra y la
      // otra recibe este error (mirar antes de insertar dejaría una carrera)
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'BOOK_ALREADY_EXISTS',
          `El libro ${book.isbn} ya existe`,
        );
      }
      throw error;
    }
    return {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      price: book.price,
      active: true,
    };
  }
}
