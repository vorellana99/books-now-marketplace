import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../../../shared-kernel/domain.errors.js';
import { Isbn } from '../../../../shared-kernel/isbn.vo.js';
import { CustomerRepository } from '../../domain/customer/customer.repository.js';
import { CatalogPricing } from '../../domain/order/catalog-pricing.port.js';
import {
  CheckoutLog,
  type CheckoutRecord,
} from '../../domain/order/checkout-log.port.js';
import { OrderFactory } from '../../domain/order/order.factory.js';
import { OrderRepository } from '../../domain/order/order.repository.js';
import { StockReservation } from '../../domain/order/stock-reservation.port.js';
import { PaymentGateway } from '../../domain/payment/payment-gateway.port.js';
import { freeShippingSpec } from '../../domain/pricing/free-shipping.specification.js';
import { PricingService } from '../../domain/pricing/pricing.service.js';
import {
  PlaceOrderCommand,
  type PlaceOrderResult,
} from './place-order.command.js';
import { hashRequest } from './request-hash.js';

@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  private readonly logger = new Logger(PlaceOrderHandler.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly catalog: CatalogPricing,
    private readonly stock: StockReservation,
    private readonly checkouts: CheckoutLog,
    private readonly pricing: PricingService,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(cmd: PlaceOrderCommand): Promise<PlaceOrderResult> {
    // 0. Idempotencia: un reintento con la misma clave nunca crea otro pedido ni cobra otra vez.
    // Los ISBN se normalizan antes: "978-0-…" y "978…" son el mismo libro y deben dar el mismo hash
    const items = cmd.items.map((i) => ({
      isbn: Isbn.create(i.isbn).value,
      quantity: i.quantity,
    }));
    const requestHash = hashRequest(cmd.customerId, items);
    const previous = await this.checkouts.findByKey(cmd.idempotencyKey);
    if (previous) return this.replay(previous, requestHash);

    // 1. Sin efectos: validar, pedir precios, armar el pedido y calcular el total
    const customer = await this.customers.findById(cmd.customerId);
    if (!customer) throw new NotFoundError('Customer', cmd.customerId);
    const order = OrderFactory.fromCart(
      this.orders.nextId(),
      customer.id,
      await this.catalog.priceCart(items),
    );
    const finalPrice = this.pricing
      .calculateFinalPrice(
        order,
        customer,
        freeShippingSpec.isSatisfiedBy({ order, customer }),
      )
      .toFinal();
    const lines = order
      .getLines()
      .map((l) => ({ isbn: l.isbn.value, quantity: l.quantity }));

    // 2. Efectos, en orden; si algo falla, se deshace lo hecho
    if (
      !(await this.checkouts.start(order.id, cmd.idempotencyKey, requestHash))
    ) {
      // Otra petición con la misma clave entró justo antes (la clave es única en la base)
      const existing = await this.checkouts.findByKey(cmd.idempotencyKey);
      if (!existing)
        throw new ConflictError(
          'CHECKOUT_IN_PROGRESS',
          'Esta compra todavía se está procesando',
        );
      return this.replay(existing, requestHash);
    }

    // Desde aquí, si el proceso cae, RecoverCheckoutsJob recupera el checkout
    let chargeAttempted = false;
    try {
      await this.stock.reserve(order.id, lines); // sin stock → no reservó nada; release no hace nada
      chargeAttempted = true;
      const payment = await this.payments.charge(
        finalPrice,
        cmd.cardToken,
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
      if (await this.checkouts.isCompleted(order.id)) {
        // El commit sí ocurrió (la respuesta se perdió): el pedido es válido, no se compensa
        return { orderId: order.id, charged: finalPrice };
      }
      try {
        if (chargeAttempted) await this.payments.refund(order.id); // idempotente: cubre rechazos y timeouts
        await this.stock.release(order.id);
        await this.checkouts.abort(order.id); // solo si TODAS las compensaciones terminaron
      } catch (compensationError) {
        // No se marca ABORTED: queda PENDING y RecoverCheckoutsJob reintenta las compensaciones
        this.logger.error(
          `Compensación incompleta para ${order.id}: ${String(compensationError)}`,
        );
      }
      throw e; // el cliente recibe el error original, no el de la compensación
    }
    return { orderId: order.id, charged: finalPrice };
  }

  // Responde un reintento según cómo terminó el intento original
  private replay(
    checkout: CheckoutRecord,
    requestHash: string,
  ): PlaceOrderResult {
    if (checkout.requestHash !== requestHash) {
      throw new DomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'Esta Idempotency-Key ya se usó con otro carrito',
      );
    }
    if (checkout.status === 'COMPLETED') {
      if (!checkout.charged)
        throw new Error(
          `El checkout ${checkout.orderId} está completo pero no tiene monto`,
        );
      return { orderId: checkout.orderId, charged: checkout.charged };
    }
    if (checkout.status === 'PENDING') {
      throw new ConflictError(
        'CHECKOUT_IN_PROGRESS',
        'Esta compra todavía se está procesando',
      );
    }
    throw new DomainError(
      'PREVIOUS_ATTEMPT_FAILED',
      'El intento anterior con esta clave falló; usa una clave nueva',
    );
  }
}
