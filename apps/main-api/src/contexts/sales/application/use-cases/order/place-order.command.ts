import { Command } from '@nestjs/cqrs';
import type { ShippingAddressData } from '../../../domain/order/shipping-address.vo.js';
import type { CartItem } from '../../../domain/ports/catalog-pricing.port.js';
import type { Money } from '../../../domain/shared/money.vo.js';

export interface PlaceOrderResult {
  orderId: string;
  charged: Money; // ya redondeado (toFinal); se serializa como { amount: "90.00", currency: "PEN" }
}

export class PlaceOrderCommand extends Command<PlaceOrderResult> {
  constructor(
    readonly idempotencyKey: string,
    readonly customerId: string,
    readonly items: CartItem[],
    readonly shippingAddress: ShippingAddressData, // sin validar: el handler la normaliza y la valida
    readonly cardToken: string, // solo viaja a la pasarela: nunca se guarda ni se registra
  ) {
    super();
  }
}
