import { Query } from '@nestjs/cqrs';
import type { Role } from '../../../../shared-kernel/role.js';

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

// Quién pregunta: un comprador solo ve sus pedidos; un administrador, los de cualquiera
export interface OrderRequester {
  userId: string;
  role: Role;
}

// Lectura directa de la base, sin pasar por el agregado. Falla con NotFoundError si el pedido no existe o, para un
// comprador, si es de otro cliente (el mismo error, para no revelar que existe)
export class GetOrderQuery extends Query<OrderView> {
  constructor(
    readonly id: string,
    readonly requester: OrderRequester,
  ) {
    super();
  }
}
