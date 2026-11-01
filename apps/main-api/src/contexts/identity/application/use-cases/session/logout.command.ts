import { Command } from '@nestjs/cqrs';

// Cierra la sesión a la que pertenece el token de refresco (esa y solo esa; las de otros dispositivos siguen). No falla
// nunca: con un token desconocido, mal formado o ya cerrado no hace nada, para no revelar si existía
export class LogoutCommand extends Command<void> {
  constructor(readonly refreshToken: string) {
    super();
  }
}
