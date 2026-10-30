import { Command } from '@nestjs/cqrs';
import type { Session } from '../../services/session.js';

// Inicia sesión con correo y contraseña y abre una sesión nueva. Falla con AuthenticationError INVALID_CREDENTIALS,
// siempre igual, sea cual sea la causa: correo desconocido, mal escrito o contraseña equivocada
export class LoginCommand extends Command<Session> {
  constructor(
    readonly email: string,
    readonly password: string,
  ) {
    super();
  }
}
