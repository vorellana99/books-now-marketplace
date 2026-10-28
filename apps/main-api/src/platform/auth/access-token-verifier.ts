import type { AuthenticatedUser } from './authenticated-user.js';

// Un token que no se acepta. `reason` es solo para los logs (vencido o inválido); a quien llama se le dice siempre lo
// mismo, y el mensaje nunca repite el token ni el secreto
export class TokenVerificationError extends Error {
  constructor(readonly reason: 'expired' | 'invalid') {
    super('El token no es válido o está vencido');
  }
}

// La plataforma (el guard de las rutas) depende de este puerto y no de Identidad: quien lo implementa es el contexto
// de Identidad. Lanza TokenVerificationError
export abstract class AccessTokenVerifier {
  abstract verify(token: string): Promise<AuthenticatedUser>;
}
