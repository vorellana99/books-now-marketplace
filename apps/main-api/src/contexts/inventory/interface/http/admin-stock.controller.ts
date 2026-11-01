import { Body, Controller, Param, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiParam,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { AdminApi } from '../../../../platform/http/admin-api.decorator.js';
import {
  AddStockCommand,
  type StockLevel,
} from '../../application/use-cases/stock/add-stock.command.js';
import { AddStockDto, StockLevelResponse } from './add-stock.dto.js';
import { ApiAuthErrors } from '../../../../platform/http/api-auth-errors.decorator.js';

// Administración del stock. Solo administradores
@AdminApi()
@Controller('admin/stock')
export class AdminStockController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':isbn/additions')
  @ApiOperation({
    summary: 'Cargar stock: suma unidades a lo disponible de un libro',
    description:
      'Es una suma, no un valor final: una carga y una reserva a la vez no se pisan. El libro debe tener registro de stock (lo crea Inventario cuando se crea el libro).',
  })
  @ApiParam({
    name: 'isbn',
    example: '9780132350884',
    description: 'ISBN-13, con o sin guiones',
  })
  @ApiCreatedResponse({ type: StockLevelResponse })
  @ApiBadRequestResponse({
    description:
      'quantity falta, no es un entero de 1 a 100000, o hay campos de más',
  })
  @ApiAuthErrors('FORBIDDEN: solo los administradores')
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_ISBN, STOCK_ITEM_NOT_FOUND (el libro no tiene registro de stock) o STOCK_LIMIT_EXCEEDED (lo disponible pasaría de 1 000 000)',
  })
  add(
    @Param('isbn') isbn: string,
    @Body() dto: AddStockDto,
  ): Promise<StockLevel> {
    return this.commandBus.execute(new AddStockCommand(isbn, dto.quantity));
  }
}
