import { Decimal } from 'decimal.js';
import { DomainError } from '../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';

export type BookCurrency = 'PEN' | 'USD';
const CURRENCIES: readonly string[] = ['PEN', 'USD'];

export const BOOK_LIMITS = { title: 200, author: 150 } as const;
// Un precio de venta de un libro: más de cero y, por prudencia, no más de un millón (un cero de más es un error común)
export const MAX_PRICE = '1000000';
const PRICE_FORMAT = /^\d+(\.\d{1,2})?$/; // dígitos y hasta 2 decimales, con punto: sin signo, coma ni notación científica

export interface NewBookData {
  isbn: string;
  title: string;
  author: string;
  price: { amount: string; currency: string };
}

const invalidBook = (field: string, why: string) =>
  new DomainError('INVALID_BOOK', `Libro inválido: el campo ${field} ${why}`);
const invalidPrice = (why: string) =>
  new DomainError('INVALID_PRICE', `Precio inválido: ${why}`);

const hasControlChars = (text: string) => {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

function cleanText(field: keyof typeof BOOK_LIMITS, raw: unknown): string {
  if (typeof raw !== 'string') throw invalidBook(field, 'debe ser un texto');
  const value = raw.trim();
  if (value === '') throw invalidBook(field, 'es obligatorio');
  if (hasControlChars(value)) {
    throw invalidBook(
      field,
      'no puede tener saltos de línea ni caracteres de control',
    );
  }
  if (value.length > BOOK_LIMITS[field]) {
    throw invalidBook(
      field,
      `no puede superar ${BOOK_LIMITS[field]} caracteres`,
    );
  }
  return value;
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
    const title = cleanText('title', data.title);
    const author = cleanText('author', data.author);
    return new NewBook(isbn, title, author, NewBook.priceOf(data.price));
  }

  private static priceOf(price: NewBookData['price'] | undefined) {
    if (!price || typeof price.amount !== 'string') {
      throw invalidPrice('el monto debe ser un texto, por ejemplo "45.00"');
    }
    if (!PRICE_FORMAT.test(price.amount)) {
      throw invalidPrice(
        'use dígitos y hasta 2 decimales con punto, por ejemplo "45.00"',
      );
    }
    const amount = new Decimal(price.amount);
    if (amount.lte(0)) throw invalidPrice('debe ser mayor que cero');
    if (amount.gt(MAX_PRICE)) {
      throw invalidPrice(`no puede superar ${MAX_PRICE}`);
    }
    if (!CURRENCIES.includes(price.currency)) {
      throw new DomainError(
        'INVALID_CURRENCY',
        `Moneda inválida: use ${CURRENCIES.join(' o ')}`,
      );
    }
    return {
      amount: amount.toFixed(2),
      currency: price.currency as BookCurrency,
    };
  }
}
