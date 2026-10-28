import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { AuthenticationError } from '../../shared-kernel/domain.errors.js';
import type { AuthenticatedUser } from './authenticated-user.js';

export type AuthenticatedRequest = { user?: AuthenticatedUser };

// El usuario que el guard identificó con el token: su id y su rol. En una ruta @Public no hay usuario (undefined)
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);

// Para las rutas que no tienen sentido sin usuario: si el guard no lo puso (la ruta quedó pública por un descuido de
// configuración), falla cerrado con 401 en lugar de seguir con un usuario vacío
export function requireUser(
  user: AuthenticatedUser | undefined,
): AuthenticatedUser {
  if (!user) {
    throw new AuthenticationError(
      'UNAUTHENTICATED',
      'Se requiere un token de acceso válido',
    );
  }
  return user;
}
