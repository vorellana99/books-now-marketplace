import { Command } from '@nestjs/cqrs';
import type { Role } from '../../../shared-kernel/role.js';

export interface RegisteredUser {
  id: string;
  email: string;
  role: Role;
}

// Registra a un comprador (siempre con el rol BUYER: el rol no se elige). Los datos llegan sin validar: el handler
// valida el correo y la contraseña. Falla con ConflictError EMAIL_ALREADY_REGISTERED si el correo ya tiene cuenta, con
// DomainError INVALID_EMAIL o WEAK_PASSWORD si no cumplen las reglas
export class RegisterUserCommand extends Command<RegisteredUser> {
  constructor(
    readonly email: string,
    readonly password: string,
  ) {
    super();
  }
}
