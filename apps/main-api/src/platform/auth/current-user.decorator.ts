import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user.js';

export type AuthenticatedRequest = { user?: AuthenticatedUser };

// El usuario que el guard identificó con el token: su id y su rol. En una ruta @Public no hay usuario (undefined)
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().user,
);
