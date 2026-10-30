import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { OrderCursor } from '../../application/order/order-cursor.js';
import type { OrderPosition } from '../../domain/order/order-view.js';

export const MAX_HISTORY_LIMIT = 50;

// La posición de la que sigue la página, o undefined en la primera. Un cursor que no es válido es un 400
export function positionAfter(
  cursor: string | undefined,
): OrderPosition | undefined {
  if (cursor === undefined) return undefined;
  const position = OrderCursor.decode(cursor);
  if (position === null)
    throw new BadRequestException('El cursor no es válido');
  return position;
}

// Lo que comparten los dos listados de pedidos: la página
export class PageDto {
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

// Mis pedidos: el cliente es el de la sesión, así que no hay `customerId` (si llega, es un 400)
export class ListMyOrdersDto extends PageDto {}

// El historial de un cliente, para administración
export class ListOrdersDto extends PageDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Cliente cuyos pedidos se listan',
  })
  @IsUUID()
  customerId!: string;
}
