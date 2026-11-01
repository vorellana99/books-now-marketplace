import type { PricedCartItem } from '../model/order/order.factory.js';

export interface CartItem {
  isbn: string;
  quantity: number;
}

// Pide a Catálogo el título y el precio vigentes de cada libro del carrito
export abstract class CatalogPricing {
  abstract priceCart(items: CartItem[]): Promise<PricedCartItem[]>; // NotFoundError si un libro no existe o está inactivo
}
