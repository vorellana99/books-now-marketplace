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
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import {
  GetOrderQuery,
  type OrderView,
} from '../../application/order/get-order.query.js';
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from '../../application/order/place-order.command.js';
import { PlaceOrderDto } from './place-order.dto.js';
import { OrderResponse, PlaceOrderResponse } from './order.response.js';

@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Comprar: reserva el stock, cobra y registra el pedido',
    description:
      'Idempotente: repetir la misma clave y el mismo carrito devuelve el mismo resultado sin cobrar de nuevo.',
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
  @ApiNotFoundResponse({
    description: 'NOT_FOUND: el cliente o un libro no existe (o está inactivo)',
  })
  @ApiConflictResponse({
    description:
      'CHECKOUT_IN_PROGRESS: otra petición con la misma clave sigue en curso',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'OUT_OF_STOCK, STOCK_ITEM_NOT_FOUND, PAYMENT_DECLINED, IDEMPOTENCY_KEY_REUSED, PREVIOUS_ATTEMPT_FAILED, INVALID_ISBN, MAX_QUANTITY_EXCEEDED, CURRENCY_MISMATCH u otra regla del dominio',
  })
  place(
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: PlaceOrderDto,
  ): Promise<PlaceOrderResult> {
    if (!key || !isUUID(key)) {
      throw new BadRequestException(
        'Falta el header Idempotency-Key, o no es un UUID',
      );
    }
    return this.commandBus.execute(
      new PlaceOrderCommand(
        key,
        dto.customerId,
        dto.items.map(({ isbn, quantity }) => ({ isbn, quantity })),
        dto.cardToken,
      ),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consultar un pedido' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: OrderResponse })
  @ApiBadRequestResponse({ description: 'El id no es un UUID' })
  @ApiNotFoundResponse({ description: 'NOT_FOUND: el pedido no existe' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<OrderView> {
    return this.queryBus.execute(new GetOrderQuery(id));
  }
}
