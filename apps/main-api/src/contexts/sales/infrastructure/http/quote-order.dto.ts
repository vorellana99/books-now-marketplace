import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { CartItemDto } from './place-order.dto.js';

// Solo el carrito: el cliente es el de la sesión y cotizar no lleva dirección, tarjeta ni clave. Las mismas validaciones
// de forma que `POST /orders` (RN-11); las reglas (ISBN válido, 10 por libro, una moneda) las aplica el dominio
export class QuoteOrderDto {
  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items!: CartItemDto[];
}
