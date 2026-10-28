import type { Money } from '../shared/money.vo.js';

// Cuántos checkouts reclama como mucho cada vuelta de la recuperación: lote × duración máxima por checkout
// (~15 s: reembolso 10 s + liberación 5 s) debe ser menor que el bloqueo de 2 minutos
export const RECOVERY_BATCH = 5;

// Cuánto queda bloqueado un checkout reclamado por la recuperación, para que otra instancia no lo tome a la vez
export const RECOVERY_LOCK_MINUTES = 2;

export type CheckoutStatus = 'PENDING' | 'COMPLETED' | 'ABORTED';

export interface CheckoutRecord {
  orderId: string;
  status: CheckoutStatus;
  requestHash: string;
  charged: Money | null; // solo existe cuando el checkout está COMPLETED
}

// El estado de la saga, persistido para poder reintentar y recuperar caídas
export abstract class CheckoutLog {
  abstract start(
    orderId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<boolean>; // false si la clave ya existe
  abstract findByKey(idempotencyKey: string): Promise<CheckoutRecord | null>;
  abstract isCompleted(orderId: string): Promise<boolean>; // ¿el pedido llegó a guardarse?
  abstract abort(orderId: string): Promise<void>; // PENDING → ABORTED (nunca toca COMPLETED)
  abstract claimStale(
    olderThanMinutes: number,
  ): Promise<{ orderId: string; requestId: string | null }[]>; // reclama PENDING antiguos
}
