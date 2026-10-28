import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AdminApi } from '../../../../platform/http/admin-api.decorator.js';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from '../../application/order/list-customer-orders.query.js';
import { ListOrdersDto } from './list-orders.dto.js';
import { positionAfter } from './order-cursor.js';
import { OrderHistoryResponse } from './order.response.js';

// Administración de pedidos: el historial de cualquier cliente. Solo administradores (y, hasta la tarea 7.9, con
// ADMIN_API_ENABLED=true): trae nombre, teléfono y dirección de la persona
@AdminApi()
@ApiTags('orders')
@Controller('admin/orders')
export class AdminOrderController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({
    summary: 'Historial de pedidos de un cliente (administración)',
    description:
      'Del más reciente al más antiguo, paginado con un cursor opaco: pasa nextCursor tal cual en ?cursor= para pedir la página siguiente. Incluye la dirección de envío. Solo administradores, con ADMIN_API_ENABLED=true.',
  })
  @ApiOkResponse({ type: OrderHistoryResponse })
  @ApiBadRequestResponse({
    description:
      'customerId falta o no es un UUID, limit fuera de 1 a 50, o el cursor no es válido',
  })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
  })
  @ApiForbiddenResponse({ description: 'FORBIDDEN: solo los administradores' })
  @ApiNotFoundResponse({
    description: 'La administración está cerrada (ADMIN_API_ENABLED=false)',
  })
  list(
    @Query() { customerId, cursor, limit }: ListOrdersDto,
  ): Promise<OrderHistoryPage> {
    return this.queryBus.execute(
      new ListCustomerOrdersQuery(customerId, limit, positionAfter(cursor)),
    );
  }
}
