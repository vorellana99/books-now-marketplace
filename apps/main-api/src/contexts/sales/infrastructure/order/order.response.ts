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
