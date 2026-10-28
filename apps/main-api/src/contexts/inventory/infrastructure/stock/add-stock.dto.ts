import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';
import { MAX_ADDITION } from '../../application/stock/add-stock.command.js';

export class AddStockDto {
  @ApiProperty({
    example: 25,
    minimum: 1,
    maximum: MAX_ADDITION,
    description:
      'Unidades a sumar al stock disponible (una suma, no un valor final)',
  })
  @IsInt()
  @Min(1)
  @Max(MAX_ADDITION)
  quantity!: number;
}

export class StockLevelResponse {
  @ApiProperty({ example: '9780132350884' })
  isbn!: string;

  @ApiProperty({ example: 25 })
  available!: number;

  @ApiProperty({ example: 2 })
  reserved!: number;
}
