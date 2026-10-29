import type { Session } from '../session/session.aggregate.js';

// Dónde viven las sesiones. Guardar una sesión es aplicar sus `changes()`
export abstract class SessionRepository {
  // Guarda una sesión recién abierta (su primer token)
  abstract open(session: Session): Promise<void>;

  // Lo que necesita una renovación: carga la sesión del token presentado, deja que `decide` aplique las reglas del
  // dominio (puede ser asíncrona: emitir el token de acceso, leer al usuario…) y guarda los cambios. Todo ocurre en una
  // transacción con el token bloqueado, así dos renovaciones simultáneas con el mismo token se ponen en fila y la segunda
  // ya lo ve usado. Si `decide` falla, no se guarda nada. Con un token desconocido, `decide` recibe null y no se guarda
  // nada. Devuelve lo que devuelve `decide`
  abstract rotate<T>(
    tokenHash: string,
    decide: (session: Session | null) => Promise<T> | T,
  ): Promise<T>;

  // Cierra la sesión de ese token (toda su familia). Con un token desconocido o ya cerrado no hace nada
  abstract revoke(tokenHash: string, now: Date): Promise<void>;

  // Borra, como mucho `limit`, los tokens que vencieron, se usaron o se revocaron hace más de N días, y devuelve cuántos.
  // Nunca borra uno vigente
  abstract purgeFinished(olderThanDays: number, limit: number): Promise<number>;
}
