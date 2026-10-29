import { randomUUID } from 'node:crypto';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { Email } from '../domain/email.vo.js';
import { PasswordHasher } from '../domain/ports/password-hasher.port.js';
import { UserRepository } from '../domain/ports/user.repository.js';
import { PasswordPolicy } from '../domain/password-policy.js';
import { User } from '../domain/user.aggregate.js';
import {
  RegisterUserCommand,
  type RegisteredUser,
} from './register-user.command.js';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(command: RegisterUserCommand): Promise<RegisteredUser> {
    const email = Email.create(command.email);
    PasswordPolicy.assert(command.password, email.value);
    // Antes de guardar: el hash es lento a propósito y no debe tener una conexión retenida
    const user = User.register({
      id: randomUUID(),
      email,
      passwordHash: await this.hasher.hash(command.password),
    });
    // El usuario y su evento se confirman juntos, y un correo que ya existe es ConflictError: lo decide el repositorio
    await this.users.save(user);
    return { id: user.id, email: user.email.value, role: user.role };
  }
}
