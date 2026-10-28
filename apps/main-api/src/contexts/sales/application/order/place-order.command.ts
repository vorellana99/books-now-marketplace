import { Command } from '@nestjs/cqrs';
import type { CartItem } from '../../domain/order/catalog-pricing.port.js';
import type { Money } from '../../domain/shared/money.vo.js';

export interface PlaceOrderResult {
  orderId: string;
  charged: Money; // ya redondeado (toFinal); se serializa como { amount: "90.00", currency: "PEN" }
}

export class PlaceOrderCommand extends Command<PlaceOrderResult> {
  constructor(
    readonly idempotencyKey: string,
    readonly customerId: string,
    readonly items: CartItem[],
    readonly cardToken: string, // solo viaja a la pasarela: nunca se guarda ni se registra
  ) {
    super();
  }
}
