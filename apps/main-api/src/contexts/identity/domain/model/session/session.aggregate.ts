import { randomUUID } from 'node:crypto';
import { generateRefreshToken } from './refresh-token.js';

// Un token de refresco tal como se guarda: solo su hash, nunca el texto que se entregó
export interface RefreshTokenRecord {
  id: string;
  hash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

// Lo que cambió en la sesión y quien la guarda debe persistir: un token que se usó, uno nuevo, o la revocación de toda la
// familia (los tokens que siguen sin revocar)
export interface SessionChanges {
  used?: { tokenId: string; at: Date };
  added?: RefreshTokenRecord;
  revokedAt?: Date;
}

export type RotationOutcome =
  | { kind: 'renewed'; userId: string; refreshToken: string }
  | { kind: 'invalid' }
  | { kind: 'reused'; userId: string; familyId: string };

// Una sesión de un usuario: la familia de tokens de refresco que nacen uno del otro, vista desde el token que se presenta.
// Cada token sirve una sola vez: se cambia por uno nuevo de la misma familia. Si un token ya usado vuelve a presentarse,
// o se copió o lo robaron, y como no se sabe quién tiene la sesión se revoca la familia entera. Las reglas son puras: no
// saben de la base de datos; quien la guarda (el repositorio) aplica `changes()` y se ocupa de que dos renovaciones
// simultáneas se pongan en fila
export class Session {
  private pending: SessionChanges = {};

  private constructor(
    readonly familyId: string,
    readonly userId: string,
    private token: RefreshTokenRecord,
  ) {}

  // Abre una sesión nueva (un inicio de sesión): una familia nueva con su primer token
  static start(input: { userId: string; now: Date; ttlMs: number }): {
    session: Session;
    refreshToken: string;
  } {
    const fresh = generateRefreshToken();
    const record: RefreshTokenRecord = {
      id: randomUUID(),
      hash: fresh.hash,
      expiresAt: new Date(input.now.getTime() + input.ttlMs),
      usedAt: null,
      revokedAt: null,
    };
    const session = new Session(randomUUID(), input.userId, record);
    session.pending = { added: record };
    return { session, refreshToken: fresh.token };
  }

  // Una sesión que ya existe, vista desde el token que se presentó
  static restore(data: {
    familyId: string;
    userId: string;
    token: RefreshTokenRecord;
  }): Session {
    return new Session(data.familyId, data.userId, { ...data.token });
  }

  // Cambia el token presentado por uno nuevo. Un token revocado o vencido no sirve y no revela nada más; uno ya usado es
  // una reutilización y revoca la familia entera
  rotate(now: Date, ttlMs: number): RotationOutcome {
    const current = this.token;
    if (current.revokedAt || current.expiresAt <= now) {
      return { kind: 'invalid' };
    }
    if (current.usedAt) {
      this.pending = { ...this.pending, revokedAt: now };
      return { kind: 'reused', userId: this.userId, familyId: this.familyId };
    }
    const next = generateRefreshToken();
    const record: RefreshTokenRecord = {
      id: randomUUID(),
      hash: next.hash,
      expiresAt: new Date(now.getTime() + ttlMs),
      usedAt: null,
      revokedAt: null,
    };
    this.token = { ...current, usedAt: now }; // presentarlo otra vez ya es una reutilización
    this.pending = { used: { tokenId: current.id, at: now }, added: record };
    return { kind: 'renewed', userId: this.userId, refreshToken: next.token };
  }

  // Cierra la sesión: revoca la familia entera, también si el token ya se usó (quien cierra sesión no quiere que su
  // sucesor siga sirviendo). Si ya estaba revocada no cambia nada, así se conserva el primer momento de la revocación
  revoke(now: Date): void {
    if (this.token.revokedAt) return;
    this.pending = { ...this.pending, revokedAt: now };
  }

  changes(): SessionChanges {
    return { ...this.pending };
  }
}
