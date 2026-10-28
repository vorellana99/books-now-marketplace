import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { BOOK_LIMITS } from '../../domain/book/new-book.js';

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
