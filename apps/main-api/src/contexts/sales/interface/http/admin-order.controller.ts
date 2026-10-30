import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AdminApi } from '../../../../platform/http/admin-api.decorator.js';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from '../../application/use-cases/order/list-customer-orders.query.js';
import { ListOrdersDto, positionAfter } from './list-orders.dto.js';
import { OrderHistoryResponse } from './order.response.js';
import { ApiAuthErrors } from '../../../../platform/http/api-auth-errors.decorator.js';

// Administración de pedidos: el historial de cualquier cliente. Solo administradores: trae nombre, teléfono y
// dirección de la persona
@AdminApi()
@ApiTags('orders')
@Controller('admin/orders')
export class AdminOrderController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Historial de pedidos de un cliente (administración)',
    description:
      'Del más reciente al más antiguo, paginado con un cursor opaco: pasa nextCursor tal cual en ?cursor= para pedir la página siguiente. Incluye la dirección de envío. Solo administradores.',
  })
  @ApiOkResponse({ type: OrderHistoryResponse })
  @ApiBadRequestResponse({
    description:
      'customerId falta o no es un UUID, limit fuera de 1 a 50, o el cursor no es válido',
  })
  @ApiAuthErrors('FORBIDDEN: solo los administradores')
  list(
    @Query() { customerId, cursor, limit }: ListOrdersDto,
  ): Promise<OrderHistoryPage> {
    return this.queryBus.execute(
      new ListCustomerOrdersQuery(customerId, limit, positionAfter(cursor)),
    );
  }
}
