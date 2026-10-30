import { randomUUID } from 'node:crypto';
import { Book } from '../../src/contexts/catalog/domain/model/book/book.aggregate.js';
import { BookChanges } from '../../src/contexts/catalog/domain/model/book/book-changes.js';
import type { BookCatalog } from '../../src/contexts/catalog/domain/ports/book-catalog.port.js';
import type { BookRepository } from '../../src/contexts/catalog/domain/ports/book.repository.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';

export interface SeedBook {
  isbn: string;
  title: string;
  author: string;
  price: string; // "45.00"
  currency: 'PEN' | 'USD';
  active: boolean;
}

export interface BookRow {
  title: string;
  author: string;
  price: string;
  currency: string;
  active: boolean;
}

export interface PublishedEvent {
  eventName: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

// Lo que cada implementación aporta además de los puertos, para preparar y mirar el estado sin pasar por ellos
export interface BookPortsSubject {
  repo: BookRepository;
  catalog: BookCatalog;
  seed(book: Partial<SeedBook>): Promise<SeedBook>; // inserta un libro tal cual (sin pasar por el dominio)
  rowOf(isbn: string): Promise<BookRow | undefined>;
  count(): Promise<number>;
  published(): Promise<PublishedEvent[]>; // los eventos que dejó guardar, en el Outbox o en memoria
}

let counter = 0;
// ISBN-13 válidos y distintos en cada llamada (prefijo 978 + 9 dígitos + dígito de control): el dominio valida el ISBN
const isbn = () => {
  const body = `978${String(500000 + ++counter).padStart(9, '0')}`;
  const sum = body
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
};

// La misma batería para el fake en memoria y para los adaptadores de Prisma: así el fake con el que se prueban los casos
// de uso no se desvía de lo real. Cada test pide un sujeto nuevo
export function bookPortsContract(
  name: string,
  create: () => Promise<BookPortsSubject>,
): void {
  const data = (overrides: Record<string, unknown> = {}) => ({
    isbn: isbn(),
    title: 'Clean Code',
    author: 'Robert C. Martin',
    price: { amount: '45.00', currency: 'PEN' },
    ...overrides,
  });
  const error = (p: Promise<unknown>) =>
    p.then(
      () => undefined,
      (e: unknown) => e,
    );

  describe(`BookRepository: contrato (${name})`, () => {
    describe('save', () => {
      it('guarda un libro activo, con el precio de 2 decimales y su moneda', async () => {
        const s = await create();
        const book = Book.register(
          data({
            isbn: '978-0-13-235088-4',
            price: { amount: '45', currency: 'USD' },
          }),
        );

        await s.repo.save(book);

        expect(await s.rowOf('9780132350884')).toEqual({
          title: 'Clean Code',
          author: 'Robert C. Martin',
          price: '45.00',
          currency: 'USD',
          active: true,
        });
      });

      it('publica catalog.book.created junto con el libro', async () => {
        const s = await create();
        const d = data();

        await s.repo.save(Book.register(d));

        const events = await s.published();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          eventName: 'catalog.book.created',
          aggregateId: d.isbn,
        });
        expect(events[0]?.payload).toMatchObject({ isbn: d.isbn });
      });

      it('un ISBN que ya existe es ConflictError BOOK_ALREADY_EXISTS y no deja un segundo libro ni un segundo evento', async () => {
        const s = await create();
        const d = data();
        await s.repo.save(Book.register(d));

        const failed = await error(s.repo.save(Book.register(d)));

        expect(failed).toBeInstanceOf(ConflictError);
        expect((failed as ConflictError).code).toBe('BOOK_ALREADY_EXISTS');
        expect(await s.count()).toBe(1);
        expect(await s.published()).toHaveLength(1);
      });

      it('dos altas simultáneas del mismo ISBN: una entra y la otra recibe el conflicto', async () => {
        const s = await create();
        const d = data();

        const results = await Promise.allSettled([
          s.repo.save(Book.register(d)),
          s.repo.save(Book.register(d)),
        ]);

        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find(
          (r) => r.status === 'rejected',
        ) as PromiseRejectedResult;
        expect((rejected.reason as ConflictError).code).toBe(
          'BOOK_ALREADY_EXISTS',
        );
        expect(await s.count()).toBe(1);
      });

      it('guardar dos veces el mismo libro no publica dos veces el evento', async () => {
        const s = await create();
        const book = Book.register(data());
        await s.repo.save(book);

        await s.repo.save(book).catch(() => undefined);

        expect(await s.published()).toHaveLength(1);
      });
    });

    describe('update', () => {
      const change =
        (raw: Parameters<typeof BookChanges.create>[0]) => (book: Book) =>
          book.apply(BookChanges.create(raw));

      it('un libro que no existe es NotFoundError', async () => {
        const s = await create();

        expect(
          await error(s.repo.update(isbn(), change({ title: 'x' }))),
        ).toBeInstanceOf(NotFoundError);
      });

      it('aplica los cambios, los guarda y devuelve el libro cambiado', async () => {
        const s = await create();
        const seeded = await s.seed({});

        const book = await s.repo.update(
          seeded.isbn,
          change({ title: 'Código limpio', price: { amount: '50' } }),
        );

        expect(book.toView()).toMatchObject({
          isbn: seeded.isbn,
          title: 'Código limpio',
          price: { amount: '50.00', currency: 'PEN' },
        });
        expect(await s.rowOf(seeded.isbn)).toMatchObject({
          title: 'Código limpio',
          price: '50.00',
          author: seeded.author,
        });
      });

      it('desactiva y reactiva', async () => {
        const s = await create();
        const seeded = await s.seed({});

        await s.repo.update(seeded.isbn, change({ active: false }));
        expect((await s.rowOf(seeded.isbn))?.active).toBe(false);
        await s.repo.update(seeded.isbn, change({ active: true }));
        expect((await s.rowOf(seeded.isbn))?.active).toBe(true);
      });

      it('otra moneda es CURRENCY_CANNOT_CHANGE y no se aplica nada, ni lo que iba junto', async () => {
        const s = await create();
        const seeded = await s.seed({ currency: 'PEN' });

        const failed = await error(
          s.repo.update(
            seeded.isbn,
            change({ title: 'Otro', price: { amount: '9', currency: 'USD' } }),
          ),
        );

        expect((failed as DomainError).code).toBe('CURRENCY_CANNOT_CHANGE');
        expect(await s.rowOf(seeded.isbn)).toMatchObject({
          title: seeded.title,
          price: seeded.price,
        });
      });

      it('si `change` falla, no se guarda nada y el error sube', async () => {
        const s = await create();
        const seeded = await s.seed({});

        await expect(
          s.repo.update(seeded.isbn, (book) => {
            book.apply(BookChanges.create({ title: 'Otro' }));
            throw new Error('falló la regla');
          }),
        ).rejects.toThrow('falló la regla');

        expect((await s.rowOf(seeded.isbn))?.title).toBe(seeded.title);
      });

      it('solo se escribe lo que cambia: dos cambios simultáneos de campos distintos se conservan los dos', async () => {
        const s = await create();
        const seeded = await s.seed({});

        await Promise.all([
          s.repo.update(seeded.isbn, change({ title: 'Nuevo título' })),
          s.repo.update(seeded.isbn, change({ author: 'Nuevo autor' })),
          s.repo.update(seeded.isbn, change({ price: { amount: '77' } })),
        ]);

        expect(await s.rowOf(seeded.isbn)).toMatchObject({
          title: 'Nuevo título',
          author: 'Nuevo autor',
          price: '77.00',
        });
      });

      it('actualizar no publica ningún evento', async () => {
        const s = await create();
        const seeded = await s.seed({});

        await s.repo.update(seeded.isbn, change({ title: 'x' }));

        expect(await s.published()).toEqual([]);
      });
    });
  });

  describe(`BookCatalog: contrato (${name})`, () => {
    const titles = async (
      s: BookPortsSubject,
      q?: string,
      page = 1,
      size = 20,
    ) => (await s.catalog.search(q, page, size)).items.map((b) => b.title);

    describe('search', () => {
      it('sin texto, todos los activos, ordenados por título; nunca uno desactivado', async () => {
        const s = await create();
        await s.seed({ title: 'Beta' });
        await s.seed({ title: 'Alfa' });
        await s.seed({ title: 'Gamma', active: false });

        expect(await titles(s)).toEqual(['Alfa', 'Beta']);
        expect(await titles(s, 'gamma')).toEqual([]);
      });

      it('cada libro trae isbn, título, autor y el precio como texto con su moneda', async () => {
        const s = await create();
        const book = await s.seed({ price: '45.50', currency: 'USD' });

        const page = await s.catalog.search(undefined, 1, 20);

        expect(page.items).toEqual([
          {
            isbn: book.isbn,
            title: book.title,
            author: book.author,
            price: { amount: '45.50', currency: 'USD' },
          },
        ]);
      });

      it('busca en el título o en el autor, sin distinguir mayúsculas', async () => {
        const s = await create();
        await s.seed({ title: 'Clean Code', author: 'Robert Martin' });
        await s.seed({ title: 'Refactoring', author: 'Martin Fowler' });
        await s.seed({ title: 'Domain-Driven Design', author: 'Eric Evans' });

        expect(await titles(s, 'CLEAN')).toEqual(['Clean Code']);
        expect(await titles(s, 'martin')).toEqual([
          'Clean Code',
          'Refactoring',
        ]);
        expect(await titles(s, 'driven')).toEqual(['Domain-Driven Design']);
      });

      it('no ignora los acentos: «cafe» no encuentra «Café»', async () => {
        const s = await create();
        await s.seed({ title: 'Café y libros' });

        expect(await titles(s, 'cafe')).toEqual([]);
        expect(await titles(s, 'café')).toEqual(['Café y libros']);
      });

      it('los comodines % _ y \\ se buscan como texto', async () => {
        const s = await create();
        await s.seed({ title: '100% Java' });
        await s.seed({ title: 'snake_case y más' });
        await s.seed({ title: 'ruta\\raíz' });
        await s.seed({ title: 'Cien por ciento' });

        expect(await titles(s, '100%')).toEqual(['100% Java']);
        expect(await titles(s, '%')).toEqual(['100% Java']);
        expect(await titles(s, 'snake_case')).toEqual(['snake_case y más']);
        expect(await titles(s, '_')).toEqual(['snake_case y más']);
        expect(await titles(s, '\\')).toEqual(['ruta\\raíz']);
      });

      it('un texto vacío o de espacios lista todo', async () => {
        const s = await create();
        await s.seed({ title: 'Uno' });
        await s.seed({ title: 'Dos' });

        expect(await titles(s, '   ')).toEqual(['Dos', 'Uno']);
      });

      it('con el mismo título, ordena por ISBN', async () => {
        const s = await create();
        const a = await s.seed({ title: 'Igual', isbn: '9780000000900' });
        const b = await s.seed({ title: 'Igual', isbn: '9780000000100' });

        const page = await s.catalog.search(undefined, 1, 20);

        expect(page.items.map((i) => i.isbn)).toEqual([b.isbn, a.isbn]);
      });

      it('pagina, y el total es de toda la búsqueda y no de la página', async () => {
        const s = await create();
        for (const t of ['A', 'B', 'C', 'D', 'E']) await s.seed({ title: t });

        const second = await s.catalog.search(undefined, 2, 2);
        const beyond = await s.catalog.search(undefined, 9, 2);

        expect(second.items.map((i) => i.title)).toEqual(['C', 'D']);
        expect(second).toMatchObject({ page: 2, pageSize: 2, total: 5 });
        expect(beyond.items).toEqual([]);
        expect(beyond.total).toBe(5);
      });
    });

    describe('priceOf', () => {
      it('devuelve el libro con el precio como texto de 2 decimales', async () => {
        const s = await create();
        const book = await s.seed({ price: '45', currency: 'USD' });

        expect(await s.catalog.priceOf(book.isbn)).toEqual({
          isbn: book.isbn,
          title: book.title,
          author: book.author,
          price: { amount: '45.00', currency: 'USD' },
        });
      });

      it('un libro que no existe o está inactivo es NotFoundError', async () => {
        const s = await create();
        const inactive = await s.seed({ active: false });

        expect(await error(s.catalog.priceOf(isbn()))).toBeInstanceOf(
          NotFoundError,
        );
        expect(await error(s.catalog.priceOf(inactive.isbn))).toBeInstanceOf(
          NotFoundError,
        );
      });
    });

    describe('pricesOf', () => {
      it('devuelve uno por cada ISBN distinto, en el orden de su primera aparición', async () => {
        const s = await create();
        const a = await s.seed({ title: 'A' });
        const b = await s.seed({ title: 'B' });
        const c = await s.seed({ title: 'C' });

        const result = await s.catalog.pricesOf([
          c.isbn,
          a.isbn,
          c.isbn,
          b.isbn,
          a.isbn,
        ]);

        expect(result.map((r) => r.isbn)).toEqual([c.isbn, a.isbn, b.isbn]);
      });

      it('una lista vacía devuelve []', async () => {
        const s = await create();

        expect(await s.catalog.pricesOf([])).toEqual([]);
      });

      it('un libro inexistente o inactivo es NotFoundError y nombra el primero según el orden pedido', async () => {
        const s = await create();
        const ok = await s.seed({});
        const inactive = await s.seed({ active: false });
        const missing = isbn();

        const first = await error(
          s.catalog.pricesOf([ok.isbn, missing, inactive.isbn]),
        );
        const second = await error(
          s.catalog.pricesOf([inactive.isbn, missing]),
        );

        expect(first).toBeInstanceOf(NotFoundError);
        expect((first as Error).message).toContain(missing);
        expect((second as Error).message).toContain(inactive.isbn);
      });

      it('100 libros distintos', async () => {
        const s = await create();
        const isbns: string[] = [];
        for (let i = 0; i < 100; i++)
          isbns.push((await s.seed({ price: '10.00' })).isbn);

        const result = await s.catalog.pricesOf(isbns);

        expect(result.map((r) => r.isbn)).toEqual(isbns);
        expect(randomUUID()).toBeTruthy();
      });
    });
  });
}
