import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { GetBookPriceQuery } from '../../../../contracts/catalog/get-book-price.query.js';
import {
  CatalogPricing,
  type CartItem,
} from '../../domain/order/catalog-pricing.port.js';
import type { PricedCartItem } from '../../domain/order/order.factory.js';

// Ventas habla con Catálogo solo por su contrato (`contracts/`), nunca con su código interno
@Injectable()
export class CatalogInProcessAdapter extends CatalogPricing {
  constructor(private readonly queryBus: QueryBus) {
    super();
  }

  async priceCart(items: CartItem[]): Promise<PricedCartItem[]> {
    return Promise.all(
      items.map(async ({ isbn, quantity }) => {
        // NotFoundError si el libro no existe o está inactivo: llega con su clase, el bus no la envuelve
        const book = await this.queryBus.execute(new GetBookPriceQuery(isbn));
        // book.price es { amount: "45.00", currency: "PEN" }: se toman ambos, sin pasar por number
        return {
          isbn,
          quantity,
          title: book.title,
          price: book.price.amount,
          currency: book.price.currency,
        };
      }),
    );
  }
}
