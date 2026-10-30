import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { Customer } from '../../domain/customer/customer.aggregate.js';
import { CustomerRepository } from '../../domain/ports/customer.repository.js';

@Injectable()
export class PrismaCustomerRepository extends CustomerRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Customer | null> {
    const row = await this.prisma.customer.findUnique({ where: { id } });
    return row ? Customer.create(row.id, row.email, row.premium) : null;
  }
}
