import { Query } from '@nestjs/cqrs';

export interface MoneyView {
  amount: string; // "45.00": el monto viaja como texto
  currency: 'PEN' | 'USD';
}

export interface OrderView {
  id: string;
  status: 'PLACED';
  charged: MoneyView;
  lines: {
    isbn: string;
    title: string;
    unitPrice: MoneyView;
    quantity: number;
  }[];
}

// Lectura directa de la base, sin pasar por el agregado. Falla con NotFoundError si el pedido no existe
export class GetOrderQuery extends Query<OrderView> {
  constructor(readonly id: string) {
    super();
  }
}
