import { Query } from '@nestjs/cqrs';

// Se declara aquí y no se importa de Ventas: un contrato no depende del código interno de ningún contexto
export type CurrencyCode = 'PEN' | 'USD';

export interface BookPrice {
  isbn: string;
  title: string;
  author: string;
  price: { amount: string; currency: CurrencyCode }; // "45.00": el monto viaja como texto
}

// Falla con NotFoundError si el libro no existe o está inactivo
export class GetBookPriceQuery extends Query<BookPrice> {
  constructor(readonly isbn: string) {
    super();
  }
}
