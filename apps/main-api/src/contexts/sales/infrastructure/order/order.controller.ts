import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import { AdminApi } from '../../../../platform/http/admin-api.decorator.js';
import {
  GetOrderQuery,
  type OrderView,
} from '../../application/order/get-order.query.js';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from '../../application/order/list-customer-orders.query.js';
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from '../../application/order/place-order.command.js';
import { ListOrdersDto } from './list-orders.dto.js';
import { OrderCursor } from './order-cursor.js';
import {
  OrderHistoryResponse,
  OrderResponse,
  PlaceOrderResponse,
} from './order.response.js';
import { PlaceOrderDto } from './place-order.dto.js';

// Exigen sesión (cualquier rol) por el denegado por defecto. El cliente sigue viniendo en el cuerpo hasta la tarea 7.7
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
      'OUT_OF_STOCK, STOCK_ITEM_NOT_FOUND, PAYMENT_DECLINED, IDEMPOTENCY_KEY_REUSED, PREVIOUS_ATTEMPT_FAILED, INVALID_ISBN, INVALID_SHIPPING_ADDRESS, MAX_QUANTITY_EXCEEDED, CURRENCY_MISMATCH u otra regla del dominio',
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

  // Solo con ADMIN_API_ENABLED=true, hasta que exista la autenticación: cualquiera que conozca un customerId vería sus
  // pedidos con nombre, teléfono y dirección. El guard va en el método y no en la clase, para que POST /orders siga abierto
  @AdminApi()
  @Get()
  @ApiOperation({
    summary: 'Historial de pedidos de un cliente (administración)',
    description:
      'Del más reciente al más antiguo, paginado con un cursor opaco: pasa nextCursor tal cual en ?cursor= para pedir la página siguiente. Incluye la dirección de envío. Solo con ADMIN_API_ENABLED=true.',
  })
  @ApiOkResponse({ type: OrderHistoryResponse })
  @ApiBadRequestResponse({
    description:
      'customerId falta o no es un UUID, limit fuera de 1 a 50, o el cursor no es válido',
  })
  @ApiNotFoundResponse({
    description: 'La administración está cerrada (ADMIN_API_ENABLED=false)',
  })
  list(
    @Query() { customerId, cursor, limit }: ListOrdersDto,
  ): Promise<OrderHistoryPage> {
    const after = cursor === undefined ? undefined : OrderCursor.decode(cursor);
    if (after === null) {
      throw new BadRequestException('El cursor no es válido');
    }
    return this.queryBus.execute(
      new ListCustomerOrdersQuery(customerId, limit, after),
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
