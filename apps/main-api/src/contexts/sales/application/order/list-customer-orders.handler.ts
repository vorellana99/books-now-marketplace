import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { OrderHistory } from '../../domain/ports/order-history.js';
import { OrderCursor } from './order-cursor.js';
import {
  ListCustomerOrdersQuery,
  type OrderHistoryPage,
} from './list-customer-orders.query.js';

@QueryHandler(ListCustomerOrdersQuery)
export class ListCustomerOrdersHandler implements IQueryHandler<ListCustomerOrdersQuery> {
  constructor(private readonly history: OrderHistory) {}

  async execute({
    customerId,
    limit,
    after,
  }: ListCustomerOrdersQuery): Promise<OrderHistoryPage> {
    const { items, next } = await this.history.listByCustomer(
      customerId,
      limit,
      after,
    );
    return { items, nextCursor: next ? OrderCursor.encode(next) : null };
  }
}
