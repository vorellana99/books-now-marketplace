import { Injectable } from '@nestjs/common';
import { fromTransactionHandle } from '../../../../platform/prisma/transaction-handle.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import type { TransactionHandle } from '../../../../shared-kernel/transaction-handle.js';
import { Customer } from '../../domain/model/customer/customer.aggregate.js';
import { CustomerRepository } from '../../domain/ports/customer.repository.js';

@Injectable()
export class PrismaCustomerRepository extends CustomerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string, tx?: TransactionHandle): Promise<Customer | null> {
    const db = fromTransactionHandle(tx) ?? this.prisma;
    const row = await db.customer.findUnique({ where: { id } });
    return row ? Customer.create(row.id, row.email, row.premium) : null;
  }

  async add(customer: Customer, tx?: TransactionHandle): Promise<void> {
    const db = fromTransactionHandle(tx) ?? this.prisma;
    await db.customer.create({
      data: {
        id: customer.id,
        email: customer.email.value,
        premium: customer.isPremium,
      },
    });
  }
}
