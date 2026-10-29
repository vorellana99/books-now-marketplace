import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import {
  CurrentUser,
  requireUser,
} from '../../../../platform/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../../../../platform/auth/authenticated-user.js';
import { Roles } from '../../../../platform/auth/roles.decorator.js';
import {
  GetOrderQuery,
  type OrderDetail,
} from '../../application/order/get-order.query.js';
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from '../../application/order/place-order.command.js';
import { OrderDetailResponse, PlaceOrderResponse } from './order.response.js';
import { PlaceOrderDto } from './place-order.dto.js';

// Comprar es de los compradores, y el cliente es quien tiene la sesión: no viene en el cuerpo. Ver un pedido lo pueden su
// dueño y los administradores
@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @Roles('BUYER')
  @ApiOperation({
    summary: 'Comprar: reserva el stock, cobra y registra el pedido',
    description:
      'Compra a nombre de quien tiene la sesión (el cliente es el `sub` del token; el cuerpo no lleva `customerId`). Solo compradores. Idempotente: repetir la misma clave y el mismo carrito devuelve el mismo resultado sin cobrar de nuevo.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID generado por el cliente, uno por intento de compra. Reutilizarlo con otro carrito da 422 IDEMPOTENCY_KEY_REUSED',
  })
  @ApiCreatedResponse({ type: PlaceOrderResponse })
  @ApiBadRequestResponse({
    description:
      'Falta o es inválido el Idempotency-Key, o el cuerpo no cumple el formato',
  })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
  })
  @ApiForbiddenResponse({
    description: 'FORBIDDEN: solo los compradores pueden comprar',
  })
  @ApiNotFoundResponse({
    description:
      'NOT_FOUND: un libro no existe (o está inactivo), o el comprador aún no tiene su cliente en Ventas (se crea en alrededor de un segundo tras registrarse: reintente)',
  })
  @ApiConflictResponse({
    description:
      'CHECKOUT_IN_PROGRESS: otra petición con la misma clave sigue en curso',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'OUT_OF_STOCK, STOCK_ITEM_NOT_FOUND, PAYMENT_DECLINED, IDEMPOTENCY_KEY_REUSED, PREVIOUS_ATTEMPT_FAILED, INVALID_ISBN, INVALID_SHIPPING_ADDRESS, MAX_QUANTITY_EXCEEDED, CURRENCY_MISMATCH u otra regla del dominio',
  })
  place(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PlaceOrderDto,
  ): Promise<PlaceOrderResult> {
    const { userId } = requireUser(user);
    if (!key || !isUUID(key)) {
      throw new BadRequestException(
        'Falta el header Idempotency-Key, o no es un UUID',
      );
    }
    return this.commandBus.execute(
      new PlaceOrderCommand(
        key,
        userId,
        dto.items.map(({ isbn, quantity }) => ({ isbn, quantity })),
        // objeto plano con los campos de la dirección, no la instancia del DTO
        {
          recipient: dto.shippingAddress.recipient,
          phone: dto.shippingAddress.phone,
          line1: dto.shippingAddress.line1,
          district: dto.shippingAddress.district,
          province: dto.shippingAddress.province,
          department: dto.shippingAddress.department,
          reference: dto.shippingAddress.reference,
        },
        dto.cardToken,
      ),
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Consultar un pedido',
    description:
      'Su dueño o un administrador. Incluye la dirección de envío (null en un pedido anterior a ella). Para cualquier otro es un 404, igual que un pedido que no existe.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderDetailResponse })
  @ApiBadRequestResponse({ description: 'El id no es un UUID' })
  @ApiUnauthorizedResponse({
    description: 'UNAUTHENTICATED o TOKEN_EXPIRED: falta un token válido',
  })
  @ApiNotFoundResponse({
    description: 'NOT_FOUND: el pedido no existe o no es suyo',
  })
  get(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderDetail> {
    const { userId, role } = requireUser(user);
    return this.queryBus.execute(new GetOrderQuery(id, { userId, role }));
  }
}
