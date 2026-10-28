import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export const MAX_HISTORY_LIMIT = 50;

export class ListOrdersDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Cliente cuyos pedidos se listan',
  })
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional({
    description:
      'nextCursor de la página anterior. Es opaco: se devuelve tal cual, sin interpretarlo',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  cursor?: string; // el controlador lo decodifica: largo, caracteres, fecha e id se validan allí

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: MAX_HISTORY_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_HISTORY_LIMIT)
  limit: number = 20;
}
