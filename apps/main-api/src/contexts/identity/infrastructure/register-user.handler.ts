import { randomUUID } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { UserRegisteredEvent } from '../../../contracts/identity/user-registered.event.js';
import { OutboxWriter } from '../../../platform/outbox/outbox.writer.js';
import { Prisma } from '../../../platform/prisma/generated/client.js';
import { PrismaService } from '../../../platform/prisma/prisma.service.js';
import { ConflictError } from '../../../shared-kernel/domain.errors.js';
import {
  RegisterUserCommand,
  type RegisteredUser,
} from '../application/register-user.command.js';
import { Email } from '../domain/email.vo.js';
import { PasswordHasher } from '../domain/password-hasher.port.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { User } from '../domain/user.aggregate.js';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly outbox: OutboxWriter,
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisteredUser> {
    const email = Email.create(command.email);
    PasswordPolicy.assert(command.password, email.value);
    // Antes de abrir la transacción: el hash es lento a propósito y no debe tener una conexión retenida
    const user = User.create({
      id: randomUUID(),
      email,
      passwordHash: await this.hasher.hash(command.password),
      role: 'BUYER',
    });
    try {
      // El usuario y su evento se confirman juntos: guardados por separado, una caída entre ambos dejaría un comprador
      // sin cliente en Ventas
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: user.id,
            email: user.email.value,
            passwordHash: user.passwordHash,
            role: user.role,
          },
        });
        await this.outbox.append(tx, [
          new UserRegisteredEvent(user.id, user.email.value, user.role),
        ]);
      });
    } catch (error) {
      // El índice único decide, así que dos registros simultáneos del mismo correo no se pisan: uno entra y el otro
      // recibe este error (mirar antes de insertar dejaría una carrera)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          'EMAIL_ALREADY_REGISTERED',
          'Ya existe una cuenta con ese correo',
        );
      }
      throw error;
    }
    return { id: user.id, email: user.email.value, role: user.role };
  }
}
