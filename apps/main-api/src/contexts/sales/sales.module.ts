import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxModule } from '../../platform/outbox/outbox.module.js';
import { OrderPricer } from './application/order/order-pricer.js';
import { PlaceOrderHandler } from './application/order/place-order.handler.js';
import { QuoteOrderHandler } from './application/order/quote-order.handler.js';
import { PurgeCheckoutsJob } from './application/order/purge-checkouts.job.js';
import { RecoverCheckoutsJob } from './application/order/recover-checkouts.job.js';
import { CreateCustomerHandler } from './application/customer/create-customer.handler.js';
import { GetOrderHandler } from './application/order/get-order.handler.js';
import { ListCustomerOrdersHandler } from './application/order/list-customer-orders.handler.js';
import { OrderHistory } from './domain/ports/order-history.js';
import { SendOrderConfirmationConsumer } from './infrastructure/consumers/send-order-confirmation.consumer.js';
import { PrismaOrderHistory } from './infrastructure/persistence/prisma-order-history.js';
import { CustomerRepository } from './domain/ports/customer.repository.js';
import { CatalogPricing } from './domain/ports/catalog-pricing.port.js';
import { CheckoutLog } from './domain/ports/checkout-log.port.js';
import { Notifier } from './domain/ports/notifier.port.js';
import { OrderRepository } from './domain/ports/order.repository.js';
import { StockReservation } from './domain/ports/stock-reservation.port.js';
import { PaymentGateway } from './domain/ports/payment-gateway.port.js';
import { PricingService } from './domain/pricing/pricing.service.js';
import { CreateCustomerConsumer } from './infrastructure/consumers/create-customer.consumer.js';
import { PrismaCustomerRepository } from './infrastructure/persistence/prisma-customer.repository.js';
import { CatalogInProcessAdapter } from './infrastructure/adapters/catalog-in-process.adapter.js';
import { ConsoleNotifier } from './infrastructure/adapters/console-notifier.adapter.js';
import { InventoryInProcessAdapter } from './infrastructure/adapters/inventory-in-process.adapter.js';
import { AdminOrderController } from './infrastructure/http/admin-order.controller.js';
import { MyOrdersController } from './infrastructure/http/my-orders.controller.js';
import { OrderController } from './infrastructure/http/order.controller.js';
import { PrismaCheckoutLog } from './infrastructure/persistence/prisma-checkout-log.adapter.js';
import { PrismaOrderRepository } from './infrastructure/persistence/prisma-order.repository.js';
import { ExternalPaymentAdapter } from './infrastructure/adapters/external-payment.adapter.js';
import { SimulatedPaymentGateway } from './infrastructure/adapters/simulated-payment-gateway.adapter.js';

// Los puertos son clases abstractas y se importan como valor: Nest necesita la clase en runtime para inyectarla
@Module({
  imports: [OutboxModule], // PrismaOrderRepository guarda el evento con OutboxWriter
  controllers: [OrderController, MyOrdersController, AdminOrderController],
  providers: [
    PlaceOrderHandler,
    GetOrderHandler,
    QuoteOrderHandler,
    ListCustomerOrdersHandler,
    CreateCustomerHandler,
    SendOrderConfirmationConsumer,
    CreateCustomerConsumer,
    RecoverCheckoutsJob,
    PurgeCheckoutsJob,
    PricingService,
    OrderPricer,
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: OrderHistory, useClass: PrismaOrderHistory },
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
