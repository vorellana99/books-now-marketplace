import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// Valida solo la forma. Las reglas (ISBN válido, máximo por libro, un precio, una moneda) las protege el dominio.
// El cliente nunca manda precios ni totales: los pone Catálogo
export class CartItemDto {
  @ApiProperty({
    example: '9780132350884',
    description: 'ISBN-13, con o sin guiones',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  isbn!: string;

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class PlaceOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  customerId!: string;

  @ApiProperty({
    example: 'tok_visa',
    description:
      'Token de la tarjeta. Solo viaja a la pasarela: no se guarda ni se registra',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cardToken!: string;

  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}
