import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../shared-kernel/role.js';

export const ROLES_KEY = 'auth:roles';

// Limita una ruta (o todas las de un controlador) a quien tenga alguno de estos roles. El rol de la ruta reemplaza al
// del controlador. Sin token da 401; con otro rol, 403
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
