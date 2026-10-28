import {
  RECOVERY_BATCH,
  RECOVERY_LOCK_MINUTES,
  CheckoutLog,
  type CheckoutRecord,
  type CheckoutStatus,
} from '../../src/contexts/sales/domain/order/checkout-log.port.js';
import type { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';

interface Row {
  orderId: string;
  requestHash: string;
  requestId: string | null;
  status: CheckoutStatus;
  charged: Money | null;
  startedAt: Date;
  lockedUntil: Date | null;
}

const MINUTE = 60_000;

export class InMemoryCheckoutLog extends CheckoutLog {
  private readonly rows = new Map<string, Row>(); // por orderId
  private readonly orderByKey = new Map<string, string>();

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  start(
    orderId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<boolean> {
    if (this.orderByKey.has(idempotencyKey)) return Promise.resolve(false);
    this.orderByKey.set(idempotencyKey, orderId);
    this.rows.set(orderId, {
      orderId,
      requestHash,
      requestId: RequestContext.requestId() ?? null,
      status: 'PENDING',
      charged: null,
      startedAt: this.now(),
      lockedUntil: null,
    });
    return Promise.resolve(true);
  }

  findByKey(idempotencyKey: string): Promise<CheckoutRecord | null> {
    const orderId = this.orderByKey.get(idempotencyKey);
    const row = orderId ? this.rows.get(orderId) : undefined;
    if (!row) return Promise.resolve(null);
    return Promise.resolve({
      orderId: row.orderId,
      status: row.status,
      requestHash: row.requestHash,
      charged: row.charged,
    });
  }

  isCompleted(orderId: string): Promise<boolean> {
    return Promise.resolve(this.rows.get(orderId)?.status === 'COMPLETED');
  }

  // Nunca toca un COMPLETED
  abort(orderId: string): Promise<void> {
    const row = this.rows.get(orderId);
    if (row?.status === 'PENDING') row.status = 'ABORTED';
    return Promise.resolve();
  }

  claimStale(
    olderThanMinutes: number,
  ): Promise<{ orderId: string; requestId: string | null }[]> {
    const now = this.now();
    const limit = now.getTime() - olderThanMinutes * MINUTE;
    const claimed: { orderId: string; requestId: string | null }[] = [];
    // los más antiguos primero, como la consulta real
    const byAge = [...this.rows.values()].sort(
      (x, y) => x.startedAt.getTime() - y.startedAt.getTime(),
    );
    for (const row of byAge) {
      if (claimed.length >= RECOVERY_BATCH) break; // un lote acotado por vuelta, como la consulta real
      const free = !row.lockedUntil || row.lockedUntil <= now;
      if (
        row.status === 'PENDING' &&
        row.startedAt.getTime() <= limit &&
        free
      ) {
        row.lockedUntil = new Date(
          now.getTime() + RECOVERY_LOCK_MINUTES * MINUTE,
        );
        claimed.push({ orderId: row.orderId, requestId: row.requestId });
      }
    }
    return Promise.resolve(claimed);
  }

  // Ayudas para los tests y para el repositorio en memoria
  expireLock(orderId: string): void {
    const row = this.rows.get(orderId);
    if (row) row.lockedUntil = new Date(0);
  }

  complete(orderId: string, charged: Money): void {
    const row = this.rows.get(orderId);
    if (!row) return;
    row.status = 'COMPLETED';
    row.charged = charged;
  }

  statusOf(orderId: string): CheckoutStatus | undefined {
    return this.rows.get(orderId)?.status;
  }

  backdate(orderId: string, minutes: number): void {
    const row = this.rows.get(orderId);
    if (row)
      row.startedAt = new Date(row.startedAt.getTime() - minutes * MINUTE);
  }
}
