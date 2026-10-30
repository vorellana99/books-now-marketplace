import type { INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Module } from '@nestjs/common';
import { CreateBookCommand } from '../../src/contexts/catalog/application/book/create-book.command.js';
import { SearchBooksQuery } from '../../src/contexts/catalog/application/book/search-books.query.js';
import { CatalogModule } from '../../src/contexts/catalog/catalog.module.js';
import { PrismaBookRepository } from '../../src/contexts/catalog/infrastructure/persistence/prisma-book.repository.js';
import { CreateBookHandler } from '../../src/contexts/catalog/application/book/create-book.handler.js';
import { GetBookPriceQuery } from '../../src/contracts/catalog/get-book-price.query.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import { deliveryRows, outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { BookCreatedProbe } from '../support/outbox-probes.js';

@Module({ providers: [BookCreatedProbe] })
class Probes {}

const book = (
  overrides: Partial<ConstructorParameters<typeof CreateBookCommand>[0]> = {},
) => ({
  isbn: '9780132350884',
  title: 'Clean Code',
  author: 'Robert C. Martin',
  price: { amount: '45.00', currency: 'PEN' as const },
  ...overrides,
});

describe('CreateBookHandler (PostgreSQL real, por el CommandBus)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let queryBus: QueryBus;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, CatalogModule, Probes);
    commandBus = app.get(CommandBus);
    queryBus = app.get(QueryBus);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const create = (data = book()) =>
    commandBus.execute(new CreateBookCommand(data));
  const rows = () =>
    query<{
      isbn: string;
      title: string;
      author: string;
      price: string;
      currency: string;
      active: boolean;
    }>(
      'SELECT isbn, title, author, price::text AS price, currency::text AS currency, active FROM catalog.books ORDER BY isbn',
    );

  describe('el libro', () => {
    it('se guarda activo, con el precio de 2 decimales y su moneda', async () => {
      await create(book({ price: { amount: '45.5', currency: 'USD' } }));

      expect(await rows()).toEqual([
        {
          isbn: '9780132350884',
          title: 'Clean Code',
          author: 'Robert C. Martin',
          price: '45.50',
          currency: 'USD',
          active: true,
        },
      ]);
    });

    it('devuelve el libro como lo muestra el catálogo: isbn, título, autor y precio como texto', async () => {
      expect(await create()).toEqual({
        isbn: '9780132350884',
        title: 'Clean Code',
        author: 'Robert C. Martin',
        price: { amount: '45.00', currency: 'PEN' },
        active: true,
      });
    });

    it('normaliza el ISBN con guiones y recorta el título y el autor', async () => {
      const created = await create(
        book({
          isbn: '978-0-13-235088-4',
          title: '  Clean Code ',
          author: ' Robert C. Martin  ',
        }),
      );

      expect(created.isbn).toBe('9780132350884');
      expect(await rows()).toMatchObject([
        {
          isbn: '9780132350884',
          title: 'Clean Code',
          author: 'Robert C. Martin',
        },
      ]);
    });

    it('aparece enseguida en la búsqueda y en la consulta de precio de Ventas', async () => {
      await create();

      const found = await queryBus.execute(
        new SearchBooksQuery('clean', 1, 20),
      );
      const priced = await queryBus.execute(
        new GetBookPriceQuery('9780132350884'),
      );

      expect(found.items.map((b: { isbn: string }) => b.isbn)).toEqual([
        '9780132350884',
      ]);
      expect(priced.price).toEqual({ amount: '45.00', currency: 'PEN' });
    });
  });

  describe('reglas', () => {
    it('un ISBN que ya existe da ConflictError BOOK_ALREADY_EXISTS y no cambia el libro', async () => {
      await create();

      const error = await create(
        book({
          title: 'Otro título',
          price: { amount: '99.00', currency: 'PEN' },
        }),
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).code).toBe('BOOK_ALREADY_EXISTS');
      expect(await rows()).toMatchObject([
        { title: 'Clean Code', price: '45.00' },
      ]);
    });

    it('el mismo ISBN con o sin guiones es el mismo libro', async () => {
      await create();
      const error = await create(book({ isbn: '978-0-13-235088-4' })).catch(
        (e: unknown) => e,
      );
      expect((error as ConflictError).code).toBe('BOOK_ALREADY_EXISTS');
    });

    it('un libro desactivado sigue ocupando su ISBN', async () => {
      await create();
      await query(
        "UPDATE catalog.books SET active = false WHERE isbn = '9780132350884'",
      );
      const error = await create().catch((e: unknown) => e);
      expect((error as ConflictError).code).toBe('BOOK_ALREADY_EXISTS');
    });

    it.each([
      ['ISBN inválido', book({ isbn: '123' }), 'INVALID_ISBN'],
      [
        'precio cero',
        book({ price: { amount: '0.00', currency: 'PEN' } }),
        'INVALID_PRICE',
      ],
      [
        'precio con formato inválido',
        book({ price: { amount: '4,5', currency: 'PEN' } }),
        'INVALID_PRICE',
      ],
      [
        'moneda inválida',
        book({ price: { amount: '4.50', currency: 'EUR' as never } }),
        'INVALID_CURRENCY',
      ],
      ['título vacío', book({ title: '  ' }), 'INVALID_BOOK'],
    ])('%s: %s y no guarda nada', async (_caso, data, code) => {
      const error = await create(data).catch((e: unknown) => e);

      expect((error as DomainError).code).toBe(code);
      expect(await rows()).toEqual([]);
      expect(await outboxRows()).toEqual([]);
    });

    it('dos altas simultáneas del mismo ISBN: una gana, la otra recibe BOOK_ALREADY_EXISTS, y hay un solo evento', async () => {
      const results = await Promise.allSettled([
        create(),
        create(book({ title: 'Otro' })),
        create(),
        create(),
      ]);

      const ok = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter(
        (r) => r.status === 'rejected',
      ) as PromiseRejectedResult[];
      expect(ok).toHaveLength(1);
      expect(failed.map((f) => (f.reason as DomainError).code)).toEqual([
        'BOOK_ALREADY_EXISTS',
        'BOOK_ALREADY_EXISTS',
        'BOOK_ALREADY_EXISTS',
      ]);
      expect(await rows()).toHaveLength(1);
      expect(await outboxRows()).toHaveLength(1);
    });
  });

  describe('el evento catalog.book.created', () => {
    it('se guarda con el libro y una entrega para su consumidor, con el ISBN como agregado', async () => {
      await create();

      const [event] = await outboxRows();
      expect(event).toMatchObject({
        event_name: 'catalog.book.created',
        event_version: 1,
        aggregate_id: '9780132350884',
      });
      expect(event.payload).toMatchObject({ isbn: '9780132350884' });
      expect((await deliveryRows(event.id)).map((d) => d.consumer)).toEqual([
        'test.book-created',
      ]);
    });

    it('lleva el requestId de la petición', async () => {
      await RequestContext.run('r-alta', () => create());
      expect((await outboxRows())[0].correlation_id).toBe('r-alta');
    });

    it('el evento no lleva más que el ISBN: ni precio ni título', async () => {
      await create();
      const [event] = await outboxRows();
      expect(
        Object.keys(event.payload).sort((a, b) => a.localeCompare(b)),
      ).toEqual([
        'aggregateId',
        'eventName',
        'eventVersion',
        'isbn',
        'occurredOn',
      ]);
    });

    // El libro y su evento se confirman juntos: si el evento no se puede guardar, tampoco queda el libro
    it('si falla el guardado del evento, no queda el libro', async () => {
      const failing = new CreateBookHandler(
        new PrismaBookRepository(prisma, {
          append: async () => {
            throw new Error('falló el outbox');
          },
        }),
      );

      await expect(
        failing.execute(new CreateBookCommand(book())),
      ).rejects.toThrow('falló el outbox');

      expect(await rows()).toEqual([]);
    });

    it('si el outbox escribe el evento y luego falla, el evento también se deshace', async () => {
      const real = app.get(OutboxWriter);
      const failing = new CreateBookHandler(
        new PrismaBookRepository(prisma, {
          append: async (tx, events) => {
            await real.append(tx, events);
            throw new Error('falló tras escribir');
          },
        }),
      );

      await expect(
        failing.execute(new CreateBookCommand(book())),
      ).rejects.toThrow('falló tras escribir');

      expect(await rows()).toEqual([]);
      expect(await outboxRows()).toEqual([]);
    });
  });

  it('crear un libro no crea ni toca su stock (lo hace Inventario al recibir el evento)', async () => {
    await create();
    expect(await query('SELECT 1 FROM inventory.stock_items')).toEqual([]);
  });
});
