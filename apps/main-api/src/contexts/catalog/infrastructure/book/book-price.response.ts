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

export class BookPageResponse {
  @ApiProperty({ type: [BookResponse] })
  items!: BookResponse[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({
    example: 42,
    description: 'Total de la búsqueda, no de la página',
  })
  total!: number;
}

export class AdminBookResponse extends BookResponse {
  @ApiProperty({
    description: 'false: no se muestra en el catálogo ni se puede comprar',
  })
  active!: boolean;
}
