import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetBooksPricesQuery } from '../../../../contracts/catalog/get-books-prices.query.js';
import { NotFoundError } from '../../../../shared-kernel/domain.errors.js';
import {
  CatalogPricing,
  type CartItem,
} from '../../domain/ports/catalog-pricing.port.js';
import type { PricedCartItem } from '../../domain/order/order.factory.js';

// Ventas habla con Catálogo solo por su contrato (`contracts/`), nunca con su código interno
@Injectable()
export class CatalogInProcessAdapter extends CatalogPricing {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  async priceCart(items: CartItem[]): Promise<PricedCartItem[]> {
    if (items.length === 0) return [];
    // Una sola consulta para todo el carrito. NotFoundError si un libro no existe o está inactivo: llega con su clase,
    // el bus no la envuelve
    const books = await this.queryBus.execute(
      new GetBooksPricesQuery(items.map(({ isbn }) => isbn)),
    );
    const byIsbn = new Map(books.map((book) => [book.isbn, book]));
    return items.map(({ isbn, quantity }) => {
      const book = byIsbn.get(isbn);
      // El catálogo ya falla por un libro que falte; esto impide que una línea llegue al pedido sin precio
      if (!book) throw new NotFoundError('Book', isbn);
      // book.price es { amount: "45.00", currency: "PEN" }: se toman ambos, sin pasar por number
      return {
        isbn,
        quantity,
        title: book.title,
        price: book.price.amount,
        currency: book.price.currency,
      };
    });
  }
}
