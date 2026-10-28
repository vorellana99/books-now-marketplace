import { Command } from '@nestjs/cqrs';
import type { Session } from './session.js';

// Cambia un token de refresco por una sesión nueva (token de acceso y token de refresco). Cada token sirve una sola vez:
// presentar uno ya usado revoca toda la sesión. Falla con AuthenticationError INVALID_REFRESH_TOKEN, siempre igual,
// sea un token desconocido, mal formado, vencido, revocado o reutilizado
export class RefreshSessionCommand extends Command<Session> {
  constructor(readonly refreshToken: string) {
    super();
  }
}
