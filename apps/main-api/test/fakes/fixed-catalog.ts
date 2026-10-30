import {
  CatalogPricing,
  type CartItem,
} from '../../src/contexts/sales/domain/ports/catalog-pricing.port.js';
import type { PricedCartItem } from '../../src/contexts/sales/domain/model/order/order.factory.js';
import type { Currency } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { NotFoundError } from '../../src/shared-kernel/domain.errors.js';

interface Book {
  title: string;
  price: string; // "100.00"
  currency?: Currency; // por defecto, PEN
}

// Catálogo con libros y precios fijos
export class FixedCatalog extends CatalogPricing {
  constructor(private readonly books: Record<string, Book>) {
    super();
  }

  // Un libro desconocido rechaza la promesa, como el puerto real (no lanza de forma síncrona)
  priceCart(items: CartItem[]): Promise<PricedCartItem[]> {
    const unknown = items.find(({ isbn }) => !this.books[isbn]);
    if (unknown) return Promise.reject(new NotFoundError('Book', unknown.isbn));
    return Promise.resolve(
      items.map(({ isbn, quantity }) => {
        const book = this.books[isbn];
        return {
          isbn,
          quantity,
          title: book.title,
          price: book.price,
          currency: book.currency ?? 'PEN',
        };
      }),
    );
  }
}
