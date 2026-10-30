import { ApiProperty } from '@nestjs/swagger';

// Solo describen las respuestas en Swagger; los handlers devuelven objetos con esta misma forma
export class OrderMoneyResponse {
  @ApiProperty({
    example: '90.00',
    description: 'Texto con 2 decimales, nunca un número',
  })
  amount!: string;

  @ApiProperty({ enum: ['PEN', 'USD'], example: 'PEN' })
  currency!: 'PEN' | 'USD';
}

export class QuoteLineResponse {
  @ApiProperty({ example: '9780132350884' })
  isbn!: string;

  @ApiProperty({ type: OrderMoneyResponse })
  unitPrice!: OrderMoneyResponse;

  @ApiProperty({
    example: 2,
    description: 'Las líneas repetidas ya vienen sumadas',
  })
  quantity!: number;

  @ApiProperty({
    type: OrderMoneyResponse,
    description: 'Precio unitario × cantidad, exacto',
  })
  subtotal!: OrderMoneyResponse;
}

// El total antes de pagar. Todos los montos salen ya redondeados y suman: subtotal − discount + shipping = total
export class OrderQuoteResponse {
  @ApiProperty({ enum: ['PEN', 'USD'], example: 'PEN' })
  currency!: 'PEN' | 'USD';

  @ApiProperty({
    type: [QuoteLineResponse],
    description: 'Ordenadas por ISBN',
  })
  lines!: QuoteLineResponse[];

  @ApiProperty({ type: OrderMoneyResponse, description: 'Antes del descuento' })
  subtotal!: OrderMoneyResponse;

  @ApiProperty({
    type: OrderMoneyResponse,
    description: 'El descuento premium; 0.00 para un cliente normal',
  })
  discount!: OrderMoneyResponse;

  @ApiProperty({
    type: OrderMoneyResponse,
    description: '0.00 si el envío es gratis',
  })
  shipping!: OrderMoneyResponse;

  @ApiProperty({
    type: OrderMoneyResponse,
    description:
      'Lo que se cobraría hoy con este carrito. Puede cambiar si cambia un precio o la condición premium: lo que manda es el `charged` del pedido',
  })
  total!: OrderMoneyResponse;
}

export class PlaceOrderResponse {
  @ApiProperty({ format: 'uuid' })
  orderId!: string;

  @ApiProperty({ type: OrderMoneyResponse })
  charged!: OrderMoneyResponse;
}

export class OrderLineResponse {
  @ApiProperty({ example: '9780132350884' })
  isbn!: string;

  @ApiProperty({ example: 'Clean Code' })
  title!: string;

  @ApiProperty({ type: OrderMoneyResponse })
  unitPrice!: OrderMoneyResponse;

  @ApiProperty({ example: 2 })
  quantity!: number;
}

export class OrderResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['PLACED'] })
  status!: 'PLACED';

  @ApiProperty({ type: OrderMoneyResponse })
  charged!: OrderMoneyResponse;

  @ApiProperty({ type: [OrderLineResponse] })
  lines!: OrderLineResponse[];
}

export class ShippingAddressResponse {
  @ApiProperty({ example: 'María Quispe' }) recipient!: string;
  @ApiProperty({ example: '+51 987 654 321' }) phone!: string;
  @ApiProperty({ example: 'Jr. Ucayali 150, Dpto 2' }) line1!: string;
  @ApiProperty({ example: 'Barranco' }) district!: string;
  @ApiProperty({ example: 'Lima' }) province!: string;
  @ApiProperty({ example: 'Lima' }) department!: string;
  @ApiProperty({ example: 'Casa de rejas verdes', nullable: true }) reference!:
    string | null;
}

// El pedido con su dirección: lo que ve su dueño o un administrador
export class OrderDetailResponse extends OrderResponse {
  @ApiProperty({
    type: ShippingAddressResponse,
    nullable: true,
    description:
      'null en un pedido anterior a que existiera la dirección de envío',
  })
  shippingAddress!: ShippingAddressResponse | null;
}

export class OrderHistoryItemResponse extends OrderDetailResponse {
  @ApiProperty({
    example: '2026-10-28T10:00:00.000Z',
    description: 'ISO 8601, en UTC',
  })
  createdAt!: string;
}

export class OrderHistoryResponse {
  @ApiProperty({ type: [OrderHistoryItemResponse] })
  items!: OrderHistoryItemResponse[];

  @ApiProperty({
    nullable: true,
    description:
      'Cursor de la página siguiente; null en la última. Se pasa tal cual en ?cursor=',
  })
  nextCursor!: string | null;
}
