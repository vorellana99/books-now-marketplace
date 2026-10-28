import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SHIPPING_LIMITS } from '../../domain/order/shipping-address.vo.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// Valida solo la forma. Las reglas (ISBN válido, máximo por libro, un precio, una moneda, el formato del teléfono)
// las protege el dominio. El cliente nunca manda precios ni totales: los pone Catálogo
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

// Dirección de entrega. Se copia en el pedido: si el cliente cambia la suya después, el pedido conserva esta
export class ShippingAddressDto {
  @ApiProperty({
    example: 'María Quispe',
    maxLength: SHIPPING_LIMITS.recipient,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHIPPING_LIMITS.recipient)
  recipient!: string;

  @ApiProperty({
    example: '+51 987 654 321',
    description: 'Dígitos, espacios, + - y paréntesis; al menos 6 dígitos',
    maxLength: SHIPPING_LIMITS.phone,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHIPPING_LIMITS.phone)
  phone!: string;

  @ApiProperty({
    example: 'Jr. Ucayali 150, Dpto 2',
    maxLength: SHIPPING_LIMITS.line1,
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHIPPING_LIMITS.line1)
  line1!: string;

  @ApiProperty({ example: 'Barranco', maxLength: SHIPPING_LIMITS.district })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHIPPING_LIMITS.district)
  district!: string;

  @ApiProperty({ example: 'Lima', maxLength: SHIPPING_LIMITS.province })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHIPPING_LIMITS.province)
  province!: string;

  @ApiProperty({ example: 'Lima', maxLength: SHIPPING_LIMITS.department })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(SHIPPING_LIMITS.department)
  department!: string;

  @ApiPropertyOptional({
    example: 'Casa de rejas verdes',
    description: 'Referencia para el repartidor',
    maxLength: SHIPPING_LIMITS.reference,
    nullable: true,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(SHIPPING_LIMITS.reference)
  reference?: string | null;
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

  @ApiProperty({ type: ShippingAddressDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress!: ShippingAddressDto;
}
