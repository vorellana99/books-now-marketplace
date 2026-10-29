import { Injectable } from '@nestjs/common';
import { OutboxWriter } from '../../../../platform/outbox/outbox.writer.js';
import { PrismaService } from '../../../../platform/prisma/prisma.service.js';
import { isUniqueViolation } from '../../../../platform/prisma/unique-violation.js';
import { ConflictError } from '../../../../shared-kernel/domain.errors.js';
import { Email } from '../../domain/email.vo.js';
import { UserRepository } from '../../domain/ports/user.repository.js';
import { User } from '../../domain/user.aggregate.js';

interface UserRow {
  id: string;
  email: string;
  passwordHash: string;
  role: 'BUYER' | 'ADMIN';
}

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Pick<OutboxWriter, 'append'>,
  ) {
    super();
  }

  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.value },
    });
    return row ? this.toUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? this.toUser(row) : null;
  }

  async save(user: User): Promise<void> {
    const events = user.pullEvents();
    try {
      // El usuario y su evento se confirman juntos
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: user.id,
            email: user.email.value,
            passwordHash: user.passwordHash,
            role: user.role,
          },
        });
        await this.outbox.append(tx, events);
      });
    } catch (error) {
      // El índice único decide, así que dos altas simultáneas del mismo correo no se pisan: una entra y la otra recibe
      // este error (mirar antes de insertar dejaría una carrera)
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'EMAIL_ALREADY_REGISTERED',
          'Ya existe una cuenta con ese correo',
        );
      }
      throw error;
    }
  }

  private toUser(row: UserRow): User {
    return User.create({
      id: row.id,
      email: Email.create(row.email),
      passwordHash: row.passwordHash,
      role: row.role,
    });
  }
}
