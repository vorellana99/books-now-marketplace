import { ApiProperty } from '@nestjs/swagger';

// Solo describe la respuesta en Swagger; el handler devuelve un objeto con esta misma forma
export class MoneyResponse {
  @ApiProperty({
    example: '45.00',
    description: 'Texto con 2 decimales, nunca un número',
  })
  amount!: string;

  @ApiProperty({ enum: ['PEN', 'USD'], example: 'PEN' })
  currency!: 'PEN' | 'USD';
}

export class BookResponse {
  @ApiProperty({ example: '9780132350884' })
  isbn!: string;

  @ApiProperty({ example: 'Clean Code' })
  title!: string;

  @ApiProperty({ example: 'Robert C. Martin' })
  author!: string;

  @ApiProperty({ type: MoneyResponse })
  price!: MoneyResponse;
}
