import type { BookPrice } from '../../src/contracts/catalog/get-book-price.query.js';
import { Book } from '../../src/contexts/catalog/domain/book/book.aggregate.js';
import type {
  BookPage,
  BookView,
} from '../../src/contexts/catalog/domain/book/book-view.js';
import { BookCatalog } from '../../src/contexts/catalog/domain/ports/book-catalog.js';
import { BookRepository } from '../../src/contexts/catalog/domain/ports/book.repository.js';
import {
  ConflictError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';
import type {
  SeedBook,
  PublishedEvent,
} from '../support/book-ports.contract.js';

let seeded = 0;
const nextIsbn = () => {
  const body = `978${String(800000 + ++seeded).padStart(9, '0')}`;
  const sum = body
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
};

// Los libros en memoria: un almacén compartido por los dos puertos (el de escritura y el de lectura), como la misma
// tabla de la base. Un ISBN no se repite, como la clave primaria
export class InMemoryBooks {
  private readonly books = new Map<string, BookView>();
  private readonly events: PublishedEvent[] = [];

  readonly repository: BookRepository = new InMemoryBookRepository(
    this.books,
    this.events,
  );
  readonly catalog: BookCatalog = new InMemoryBookCatalog(this.books);

  // Ayudas para las pruebas
  seed(book: Partial<SeedBook>): SeedBook {
    const full: SeedBook = {
      isbn: nextIsbn(),
      title: 'Clean Code',
      author: 'Robert C. Martin',
      price: '45.00',
      currency: 'PEN',
      active: true,
      ...book,
    };
    this.books.set(full.isbn, {
      isbn: full.isbn,
      title: full.title,
      author: full.author,
      price: { amount: Number(full.price).toFixed(2), currency: full.currency },
      active: full.active,
    });
    return full;
  }

  rowOf(isbn: string) {
    const b = this.books.get(isbn);
    return b
      ? {
          title: b.title,
          author: b.author,
          price: b.price.amount,
          currency: b.price.currency,
          active: b.active,
        }
      : undefined;
  }

  count(): number {
    return this.books.size;
  }

  published(): PublishedEvent[] {
    return [...this.events];
  }
}

class InMemoryBookRepository extends BookRepository {
  constructor(
    private readonly books: Map<string, BookView>,
    private readonly events: PublishedEvent[],
  ) {
    super();
  }

  save(book: Book): Promise<void> {
    const view = book.toView();
    if (this.books.has(view.isbn)) {
      return Promise.reject(
        new ConflictError(
          'BOOK_ALREADY_EXISTS',
          `El libro ${view.isbn} ya existe`,
        ),
      );
    }
    for (const event of book.pullEvents()) {
      this.events.push({
        eventName: event.eventName,
        aggregateId: event.aggregateId,
        payload: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
      });
    }
    this.books.set(view.isbn, view);
    return Promise.resolve();
  }

  update(isbn: string, change: (book: Book) => void): Promise<Book> {
    const current = this.books.get(isbn);
    if (!current) return Promise.reject(new NotFoundError('Book', isbn));
    const book = Book.restore(current);
    try {
      change(book); // si falla, no se guardó nada: el almacén no se ha tocado
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    this.books.set(isbn, book.toView());
    return Promise.resolve(book);
  }
}

class InMemoryBookCatalog extends BookCatalog {
  constructor(private readonly books: Map<string, BookView>) {
    super();
  }

  search(
    q: string | undefined,
    page: number,
    pageSize: number,
  ): Promise<BookPage> {
    const text = q?.trim().toLowerCase();
    const found = [...this.books.values()]
      .filter((b) => b.active)
      .filter(
        (b) =>
          !text ||
          b.title.toLowerCase().includes(text) ||
          b.author.toLowerCase().includes(text),
      )
      .sort((a, b) =>
        a.title < b.title
          ? -1
          : a.title > b.title
            ? 1
            : a.isbn < b.isbn
              ? -1
              : a.isbn > b.isbn
                ? 1
                : 0,
      );
    return Promise.resolve({
      items: found
        .slice((page - 1) * pageSize, page * pageSize)
        .map(({ isbn, title, author, price }) => ({
          isbn,
          title,
          author,
          price,
        })),
      page,
      pageSize,
      total: found.length,
    });
  }

  priceOf(isbn: string): Promise<BookPrice> {
    const book = this.books.get(isbn);
    if (!book?.active) return Promise.reject(new NotFoundError('Book', isbn));
    return Promise.resolve(this.toPrice(book));
  }

  pricesOf(isbns: string[]): Promise<BookPrice[]> {
    const distinct = [...new Set(isbns)];
    const result: BookPrice[] = [];
    for (const isbn of distinct) {
      const book = this.books.get(isbn);
      if (!book?.active) return Promise.reject(new NotFoundError('Book', isbn));
      result.push(this.toPrice(book));
    }
    return Promise.resolve(result);
  }

  private toPrice(book: BookView): BookPrice {
    return {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      price: { ...book.price },
    };
  }
}
