import type { Role } from '../../../../shared-kernel/role.js';

// Las vistas del pedido: lo que el lado de lectura devuelve sin reconstruir el agregado. Viven en el dominio porque el
// puerto `OrderHistory` las nombra; las consultas de `application/` las reexportan
export interface MoneyView {
  amount: string; // "45.00": el monto viaja como texto
  currency: 'PEN' | 'USD';
}

export interface ShippingAddressView {
  recipient: string;
  phone: string;
  line1: string;
  district: string;
  province: string;
  department: string;
  reference: string | null;
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

// El pedido con su dirección de envío (null en un pedido anterior a que existiera): lo que ve su dueño o un administrador
export interface OrderDetail extends OrderView {
  shippingAddress: ShippingAddressView | null;
}

// Un pedido en un historial (el del comprador o el de administración): el detalle del pedido, con su dirección de envío,
// más su fecha
export interface OrderHistoryItem extends OrderDetail {
  createdAt: string; // ISO 8601, en UTC
}

// Quién pregunta: un comprador solo ve sus pedidos; un administrador, los de cualquiera
export interface OrderRequester {
  userId: string;
  role: Role;
}

// La posición de un pedido en el historial (fecha desc, id desc)
export interface OrderPosition {
  createdAt: Date;
  id: string;
}
