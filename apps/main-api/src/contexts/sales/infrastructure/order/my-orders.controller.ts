import { Controller, Get, Query } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../../../../platform/auth/authenticated-user.js';
import {
  CurrentUser,
  requireUser,
} from '../../../../platform/auth/current-user.decorator.js';
import { Roles } from '../../../../platform/auth/roles.decorator.js';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from '../../application/order/list-customer-orders.query.js';
import { ListMyOrdersDto } from './list-orders.dto.js';
import { positionAfter } from './order-cursor.js';
import { OrderHistoryResponse } from './order.response.js';

// Los pedidos de quien tiene la sesión. El cliente es el del token: no se puede pedir el de otro
@ApiTags('orders')
@Controller('me/orders')
export class MyOrdersController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Mis pedidos',
    description:
      'Del más reciente al más antiguo, paginado con un cursor opaco: pasa nextCursor tal cual en ?cursor= para pedir la página siguiente. Incluye la dirección de envío de cada pedido.',
  })
  @ApiOkResponse({ type: OrderHistoryResponse })
  @ApiBadRequestResponse({
    description:
      'limit fuera de 1 a 50, el cursor no es válido o hay parámetros de más',
  })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
  })
  @ApiForbiddenResponse({
    description: 'FORBIDDEN: solo los compradores tienen pedidos',
  })
  list(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query() { cursor, limit }: ListMyOrdersDto,
  ): Promise<OrderHistoryPage> {
    const { userId } = requireUser(user);
    return this.queryBus.execute(
      new ListCustomerOrdersQuery(userId, limit, positionAfter(cursor)),
    );
  }
}
