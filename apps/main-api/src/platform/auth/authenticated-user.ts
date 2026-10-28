import type { Role } from '../../shared-kernel/role.js';

// Quien hace la petición, ya comprobado a partir de su token de acceso
export interface AuthenticatedUser {
  userId: string;
  role: Role;
}
