import { BookCreatedEvent } from '../../../../contracts/catalog/book-created.event.js';
import type { DomainEvent } from '../../../../shared-kernel/domain-event.js';
import { DomainError } from '../../../../shared-kernel/domain.errors.js';
import type { BookChangeSet } from './book-changes.js';
import type { BookCurrency } from './book-rules.js';
import type { BookView } from './book-view.js';
import { NewBook, type NewBookData } from './new-book.js';

// Lo que cambió en un libro que ya existía y quien lo guarda debe persistir. Solo las columnas que cambian: dos cambios
// simultáneos de campos distintos se conservan los dos
export interface BookUpdate {
  title?: string;
  author?: string;
  price?: { amount: string };
  active?: boolean;
}

// Un libro del catálogo. El ISBN y la moneda no cambian nunca: cambiarlos sería otro libro. Un libro nuevo (`register`)
// deja pendiente su evento `catalog.book.created`; uno que se carga de la base (`restore`) no deja nada
export class Book {
  private events: DomainEvent[] = [];
  private pending: BookUpdate = {};

  private constructor(
    readonly isbn: string,
    private title: string,
    private author: string,
    private price: { amount: string; currency: BookCurrency },
    private active: boolean,
  ) {}

  // El alta: los datos se validan y normalizan como siempre (ISBN sin guiones, texto recortado, precio con 2 decimales)
  static register(data: NewBookData): Book {
    const valid = NewBook.create(data);
    const book = new Book(
      valid.isbn,
      valid.title,
      valid.author,
      valid.price,
      true,
    );
    book.events.push(new BookCreatedEvent(valid.isbn));
    return book;
  }

  static restore(data: BookView): Book {
    return new Book(
      data.isbn,
      data.title,
      data.author,
      { ...data.price },
      data.active,
    );
  }

  // Aplica cambios ya validados (`BookChanges.create`). Todo o nada: si el precio trae otra moneda, no se aplica nada
  apply(changes: BookChangeSet): void {
    if (
      changes.price?.currency &&
      changes.price.currency !== this.price.currency
    ) {
      throw new DomainError(
        'CURRENCY_CANNOT_CHANGE',
        `La moneda de un libro no se cambia: ${this.isbn} está en ${this.price.currency}`,
      );
    }
    if (changes.title !== undefined) {
      this.title = changes.title;
      this.pending.title = changes.title;
    }
    if (changes.author !== undefined) {
      this.author = changes.author;
      this.pending.author = changes.author;
    }
    if (changes.price) {
      this.price = { ...this.price, amount: changes.price.amount };
      this.pending.price = { amount: changes.price.amount };
    }
    if (changes.active !== undefined) {
      this.active = changes.active;
      this.pending.active = changes.active;
    }
  }

  changes(): BookUpdate {
    return { ...this.pending };
  }

  toView(): BookView {
    return {
      isbn: this.isbn,
      title: this.title,
      author: this.author,
      price: { ...this.price },
      active: this.active,
    };
  }

  // Los eventos que quedaron por publicar; quien guarda el libro los toma una sola vez
  pullEvents(): DomainEvent[] {
    const pending = this.events;
    this.events = [];
    return pending;
  }
}
