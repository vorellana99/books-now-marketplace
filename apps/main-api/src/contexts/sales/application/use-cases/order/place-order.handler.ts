import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { DomainError } from '../../../../../shared-kernel/domain.errors.js';
import {
  CheckoutLog,
  type CheckoutRecord,
} from '../../../domain/ports/checkout-log.port.js';
import type { Order } from '../../../domain/model/order/order.aggregate.js';
import {
  checkoutInProgress,
  replayOf,
} from '../../../domain/model/order/checkout-replay.js';
import { ShippingAddress } from '../../../domain/model/order/shipping-address.vo.js';
import { OrderRepository } from '../../../domain/ports/order.repository.js';
import { StockReservation } from '../../../domain/ports/stock-reservation.port.js';
import { PaymentGateway } from '../../../domain/ports/payment-gateway.port.js';
import type { Money } from '../../../domain/shared/money.vo.js';
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from './place-order.command.js';
import { normalizeCart } from '../../../domain/model/order/normalize-cart.js';
import { OrderPricer } from '../../services/order-pricer.js';
import { hashRequest } from '../../../domain/model/order/request-hash.js';

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  private readonly logger = new Logger(PlaceOrderHandler.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly pricer: OrderPricer,
    private readonly stock: StockReservation,
    private readonly checkouts: CheckoutLog,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(cmd: PlaceOrderCommand): Promise<PlaceOrderResult> {
    // 0. Idempotencia: un reintento con la misma clave nunca crea otro pedido ni cobra otra vez.
    // Los ISBN se normalizan antes: "978-0-…" y "978…" son el mismo libro y deben dar el mismo hash
    const items = normalizeCart(cmd.items);
    // La dirección se valida y se normaliza antes de la huella y de cualquier efecto: una inválida es un 422 sin
    // reservar ni cobrar nada, y los espacios sobrantes no hacen pasar por otra compra un reintento
    const address = ShippingAddress.create(cmd.shippingAddress);
    const requestHash = hashRequest(cmd.customerId, items, address);
    const previous = await this.checkouts.findByKey(cmd.idempotencyKey);
    if (previous) return replayOf(previous, requestHash);

    // 1. Sin efectos: validar, pedir precios, armar el pedido y calcular el total
    const { order, breakdown } = await this.pricer.price({
      orderId: this.orders.nextId(),
      customerId: cmd.customerId,
      items,
      address,
    });
    const finalPrice = breakdown.total.toFinal();

    // 2. Efectos, en orden; si algo falla, se deshace lo hecho
    const raced = await this.start(order.id, cmd.idempotencyKey, requestHash);
    if (raced) return replayOf(raced, requestHash);
    return this.charge(order, finalPrice, cmd.cardToken);
  }

  // Registra el intento. Devuelve null si empezó, o el registro de otra petición con la misma clave que entró justo
  // antes (la clave es única en la base); si esa otra ya no se ve, todavía se está procesando
  private async start(
    orderId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<CheckoutRecord | null> {
    if (await this.checkouts.start(orderId, idempotencyKey, requestHash)) {
      return null;
    }
    const existing = await this.checkouts.findByKey(idempotencyKey);
    if (!existing) throw checkoutInProgress();
    return existing;
  }

  // Reserva, cobra y guarda. Desde aquí, si el proceso cae, RecoverCheckoutsJob recupera el checkout
  private async charge(
    order: Order,
    finalPrice: Money,
    cardToken: string,
  ): Promise<PlaceOrderResult> {
    const lines = order
      .getLines()
      .map((l) => ({ isbn: l.isbn.value, quantity: l.quantity }));
    let chargeAttempted = false;
    try {
      await this.stock.reserve(order.id, lines); // sin stock → no reservó nada; release no hace nada
      chargeAttempted = true;
      const payment = await this.payments.charge(
        finalPrice,
        cardToken,
        order.id,
      );
      if (!payment.approved) {
        throw new DomainError(
          'PAYMENT_DECLINED',
          `Pago rechazado: ${payment.reason ?? 'sin motivo'}`,
        );
      }
      order.place();
      await this.orders.save(order, finalPrice); // pedido + checkout COMPLETED + outbox
    } catch (e) {
      if (!(await this.checkouts.isCompleted(order.id))) {
        await this.compensate(order.id, chargeAttempted);
        throw e; // el cliente recibe el error original, no el de la compensación
      }
      // El commit sí ocurrió (la respuesta se perdió): el pedido es válido, no se compensa
    }
    return { orderId: order.id, charged: finalPrice };
  }

  // Deshace lo hecho, en orden: reembolsa, libera el stock y solo entonces anula el checkout. Si algo falla no se
  // marca ABORTED: queda PENDING y RecoverCheckoutsJob reintenta las compensaciones
  private async compensate(
    orderId: string,
    chargeAttempted: boolean,
  ): Promise<void> {
    try {
      if (chargeAttempted) await this.payments.refund(orderId); // idempotente: cubre rechazos y timeouts
      await this.stock.release(orderId);
      await this.checkouts.abort(orderId); // solo si TODAS las compensaciones terminaron
    } catch (compensationError) {
      this.logger.error(
        `Compensación incompleta para ${orderId}: ${String(compensationError)}`,
      );
    }
  }
}
