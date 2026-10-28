import { Command } from '@nestjs/cqrs';
import type { Role } from '../../../shared-kernel/role.js';

export interface LoginResult {
  accessToken: string;
  expiresInSeconds: number;
  user: { id: string; email: string; role: Role };
}

// Inicia sesión con correo y contraseña. Falla con AuthenticationError INVALID_CREDENTIALS, siempre igual, sea cual sea
// la causa: correo desconocido, mal escrito o contraseña equivocada
export class LoginCommand extends Command<LoginResult> {
  constructor(
    readonly email: string,
    readonly password: string,
  ) {
    super();
  }
}
