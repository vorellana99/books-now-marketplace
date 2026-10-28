import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Mientras no haya autenticación, las rutas de administración (y el historial de pedidos de un cliente) solo
// funcionan con ADMIN_API_ENABLED=true, que el esquema de entorno rechaza en producción. Si está cerrada responden
// 404 con el mismo cuerpo que da Nest para una ruta que no existe, así que no revelan que están ahí.
// Los guards corren antes que los pipes: una petición con el cuerpo inválido tampoco llega a dar 400.
// Solo `true` abre: cualquier otra cosa (ausente, texto) deja cerrado
@Injectable()
export class AdminApiEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.config.get<boolean>('ADMIN_API_ENABLED') !== true) {
      const req = context
        .switchToHttp()
        .getRequest<{ method: string; originalUrl?: string; url: string }>();
      throw new NotFoundException(
        `Cannot ${req.method} ${req.originalUrl ?? req.url}`,
      );
    }
    return true;
  }
}
