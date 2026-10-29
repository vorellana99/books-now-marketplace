import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxModule } from '../../platform/outbox/outbox.module.js';
import { PlaceOrderHandler } from './application/order/place-order.handler.js';
import { QuoteOrderHandler } from './application/order/quote-order.handler.js';
import { RecoverCheckoutsJob } from './application/order/recover-checkouts.job.js';
import { SendOrderConfirmationConsumer } from './application/order/send-order-confirmation.consumer.js';
import { CustomerRepository } from './domain/customer/customer.repository.js';
import { CatalogPricing } from './domain/order/catalog-pricing.port.js';
import { CheckoutLog } from './domain/order/checkout-log.port.js';
import { Notifier } from './domain/order/notifier.port.js';
import { OrderRepository } from './domain/order/order.repository.js';
import { StockReservation } from './domain/order/stock-reservation.port.js';
import { PaymentGateway } from './domain/payment/payment-gateway.port.js';
import { PricingService } from './domain/pricing/pricing.service.js';
import { CreateCustomerConsumer } from './infrastructure/customer/create-customer.consumer.js';
import { PrismaCustomerRepository } from './infrastructure/customer/prisma-customer.repository.js';
import { CatalogInProcessAdapter } from './infrastructure/order/catalog-in-process.adapter.js';
import { ConsoleNotifier } from './infrastructure/order/console-notifier.adapter.js';
import { GetOrderHandler } from './infrastructure/order/get-order.handler.js';
import { ListCustomerOrdersHandler } from './infrastructure/order/list-customer-orders.handler.js';
import { InventoryInProcessAdapter } from './infrastructure/order/inventory-in-process.adapter.js';
import { AdminOrderController } from './infrastructure/order/admin-order.controller.js';
import { MyOrdersController } from './infrastructure/order/my-orders.controller.js';
import { OrderController } from './infrastructure/order/order.controller.js';
import { PrismaCheckoutLog } from './infrastructure/order/prisma-checkout-log.adapter.js';
import { PrismaOrderRepository } from './infrastructure/order/prisma-order.repository.js';
import { ExternalPaymentAdapter } from './infrastructure/payment/external-payment.adapter.js';
import { SimulatedPaymentGateway } from './infrastructure/payment/simulated-payment-gateway.adapter.js';

// Los puertos son clases abstractas y se importan como valor: Nest necesita la clase en runtime para inyectarla
@Module({
  imports: [OutboxModule], // PrismaOrderRepository guarda el evento con OutboxWriter
  controllers: [OrderController, MyOrdersController, AdminOrderController],
  providers: [
    PlaceOrderHandler,
    GetOrderHandler,
    QuoteOrderHandler,
    ListCustomerOrdersHandler,
    SendOrderConfirmationConsumer,
    CreateCustomerConsumer,
    RecoverCheckoutsJob,
    PricingService,
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: CheckoutLog, useClass: PrismaCheckoutLog },
    { provide: CustomerRepository, useClass: PrismaCustomerRepository },
    { provide: CatalogPricing, useClass: CatalogInProcessAdapter },
    { provide: StockReservation, useClass: InventoryInProcessAdapter },
    {
      provide: Notifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Notifier =>
        new ConsoleNotifier(
          config.getOrThrow<number>('EMAIL_SIMULATED_DELAY_MS'),
        ),
    },
    {
      provide: PaymentGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService): PaymentGateway =>
        config.get('PAYMENT_PROVIDER') === 'external'
          ? new ExternalPaymentAdapter(config.getOrThrow('PAYMENT_API_URL'))
          : new SimulatedPaymentGateway(
              config.getOrThrow<number>('PAYMENT_SIMULATED_DELAY_MS'),
            ),
    },
  ],
})
export class SalesModule {}
