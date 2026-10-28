import type { Role } from '../../../shared-kernel/role.js';

// Lo que recibe quien inicia o renueva una sesión: un token de acceso de vida corta y uno de refresco para pedir el
// siguiente
export interface Session {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  user: { id: string; email: string; role: Role };
}
