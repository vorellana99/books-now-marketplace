import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { BOOK_LIMITS } from '../../domain/model/book/new-book.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

// El precio entra con la misma forma con la que sale: un monto en texto y su moneda. Valida solo la forma; que sea
// mayor que cero y no pase del máximo lo decide el dominio
export class PriceDto {
  @ApiProperty({
    example: '45.00',
    description: 'Texto con punto y hasta 2 decimales, nunca un número',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({ enum: ['PEN', 'USD'], example: 'PEN' })
  @IsIn(['PEN', 'USD'])
  currency!: 'PEN' | 'USD';
}

export class CreateBookDto {
  @ApiProperty({
    example: '9780132350884',
    description: 'ISBN-13, con o sin guiones',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  isbn!: string;

  @ApiProperty({ example: 'Clean Code', maxLength: BOOK_LIMITS.title })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BOOK_LIMITS.title)
  title!: string;

  @ApiProperty({ example: 'Robert C. Martin', maxLength: BOOK_LIMITS.author })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BOOK_LIMITS.author)
  author!: string;

  @ApiProperty({ type: PriceDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PriceDto)
  price!: PriceDto;
}

// El precio de un cambio: el monto, y la moneda solo si se quiere confirmar la actual. Pedir otra moneda es un error
// (decisión D5: la moneda de un libro no se cambia)
export class UpdatePriceDto {
  @ApiProperty({
    example: '49.90',
    description: 'Texto con punto y hasta 2 decimales, nunca un número',
  })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,2})?$/)
  amount!: string;

  @ApiPropertyOptional({
    enum: ['PEN', 'USD'],
    description:
      'Opcional. Si se indica, debe ser la moneda actual del libro: la moneda no se cambia',
  })
  @ValidateIf((o: UpdatePriceDto) => o.currency !== undefined)
  @IsIn(['PEN', 'USD'])
  currency?: 'PEN' | 'USD';
}

// Cualquier subconjunto de campos, pero al menos uno. Lo que no se indica no se toca; `null` no vale como "sin cambio"
export class UpdateBookDto {
  @ApiPropertyOptional({ maxLength: BOOK_LIMITS.title })
  @ValidateIf((o: UpdateBookDto) => o.title !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BOOK_LIMITS.title)
  title?: string;

  @ApiPropertyOptional({ maxLength: BOOK_LIMITS.author })
  @ValidateIf((o: UpdateBookDto) => o.author !== undefined)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BOOK_LIMITS.author)
  author?: string;

  @ApiPropertyOptional({ type: UpdatePriceDto })
  @ValidateIf((o: UpdateBookDto) => o.price !== undefined)
  @IsObject()
  @ValidateNested()
  @Type(() => UpdatePriceDto)
  price?: UpdatePriceDto;

  @ApiPropertyOptional({
    description:
      '`false` desactiva el libro (no se borra) y `true` lo reactiva',
  })
  @ValidateIf((o: UpdateBookDto) => o.active !== undefined)
  @IsBoolean()
  active?: boolean;
}
