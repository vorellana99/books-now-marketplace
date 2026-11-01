import { DomainError } from '../../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../../shared-kernel/isbn.vo.js';
import {
  cleanAmount,
  cleanBookText,
  cleanCurrency,
  type BookCurrency,
} from './book-rules.js';

export { BOOK_LIMITS, MAX_PRICE, type BookCurrency } from './book-rules.js';

export interface NewBookData {
  isbn: string;
  title: string;
  author: string;
  price: { amount: string; currency: string };
}

// Los datos de un libro que se da de alta, ya validados y normalizados: ISBN sin guiones, título y autor recortados y
// precio en texto con 2 decimales. El precio nunca pasa por `number`
export class NewBook {
  private constructor(
    readonly isbn: string,
    readonly title: string,
    readonly author: string,
    readonly price: { amount: string; currency: BookCurrency },
  ) {}

  static create(data: NewBookData): NewBook {
    const isbn = Isbn.create(data.isbn).value;
    const title = cleanBookText('title', data.title);
    const author = cleanBookText('author', data.author);
    if (!data.price) {
      throw new DomainError(
        'INVALID_PRICE',
        'Precio inválido: el monto debe ser un texto, por ejemplo "45.00"',
      );
    }
    // Primero el monto y después la moneda: un precio con ambos errores informa del monto
    const amount = cleanAmount(data.price.amount);
    return new NewBook(isbn, title, author, {
      amount,
      currency: cleanCurrency(data.price.currency),
    });
  }
}
