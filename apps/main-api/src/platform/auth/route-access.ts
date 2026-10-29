import type { Reflector } from '@nestjs/core';
import type { Role } from '../../shared-kernel/role.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ROLES_KEY } from './roles.decorator.js';

// Lo que Nest acepta como objetivo de un metadato: el método o la clase del controlador
type Target = Parameters<Reflector['get']>[1];

export interface RouteAccess {
  isPublic: boolean;
  roles: Role[] | undefined;
}

// Quién puede llamar a una ruta, según sus decoradores. Lo más específico manda: lo que diga la ruta reemplaza a lo del
// controlador. En un mismo nivel, @Roles gana a @Public (lo más estricto). Sin ninguno, hace falta sesión (denegado por
// defecto). Lo usan el guard y la documentación de Swagger, para que no puedan discrepar
export function routeAccess(
  reflector: Reflector,
  handler: Target,
  controller: Target,
): RouteAccess {
  for (const target of [handler, controller]) {
    const roles = reflector.get<Role[] | undefined>(ROLES_KEY, target);
    if (roles) return { isPublic: false, roles };
    if (reflector.get<boolean | undefined>(IS_PUBLIC_KEY, target)) {
      return { isPublic: true, roles: undefined };
    }
  }
  return { isPublic: false, roles: undefined };
}
