import type { Role } from '../../../../shared-kernel/role.js';

export interface IssuedAccessToken {
  token: string;
  expiresInSeconds: number;
}

// Emite el token de acceso de un usuario: de vida corta, firmado, sin datos personales
export abstract class AccessTokenIssuer {
  abstract issue(user: { id: string; role: Role }): Promise<IssuedAccessToken>;
}
