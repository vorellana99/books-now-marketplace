import { SessionRepository } from '../../src/contexts/identity/domain/ports/session.repository.js';
import { Session } from '../../src/contexts/identity/domain/session/session.aggregate.js';

interface Row {
  id: string;
  familyId: string;
  userId: string;
  hash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

const DAY = 86_400_000;

// Sesiones en memoria. `rotate` pone en fila las llamadas con el mismo token, como el `FOR UPDATE` de la base: la segunda
// ve ya lo que hizo la primera
export class InMemorySessionRepository extends SessionRepository {
  private readonly tokens = new Map<string, Row>(); // por id
  private readonly queues = new Map<string, Promise<unknown>>(); // por hash

  constructor(private readonly now: () => Date = () => new Date()) {
    super();
  }

  open(session: Session): Promise<void> {
    this.apply(session);
    return Promise.resolve();
  }

  rotate<T>(
    tokenHash: string,
    decide: (session: Session | null) => Promise<T> | T,
  ): Promise<T> {
    const previous = this.queues.get(tokenHash) ?? Promise.resolve();
    const run = previous.then(async () => {
      const session = this.load(tokenHash);
      const snapshot = new Map(
        [...this.tokens].map(([id, row]) => [id, { ...row }]),
      );
      try {
        const result = await decide(session);
        if (session) this.apply(session);
        return result;
      } catch (error) {
        this.tokens.clear(); // una transacción que falla no deja nada
        for (const [id, row] of snapshot) this.tokens.set(id, row);
        throw error;
      }
    });
    this.queues.set(
      tokenHash,
      run.catch(() => undefined),
    );
    return run;
  }

  async revoke(tokenHash: string, now: Date): Promise<void> {
    await this.rotate(tokenHash, (session) => {
      session?.revoke(now);
    });
  }

  purgeFinished(olderThanDays: number, limit: number): Promise<number> {
    const cutoff = this.now().getTime() - olderThanDays * DAY;
    const old = [...this.tokens.values()]
      .filter(
        (r) =>
          r.expiresAt.getTime() < cutoff ||
          (r.usedAt !== null && r.usedAt.getTime() < cutoff) ||
          (r.revokedAt !== null && r.revokedAt.getTime() < cutoff),
      )
      .slice(0, limit);
    for (const row of old) this.tokens.delete(row.id);
    return Promise.resolve(old.length);
  }

  // Ayudas para las pruebas
  rows(): Row[] {
    return [...this.tokens.values()].map((r) => ({ ...r }));
  }

  setDates(
    tokenId: string,
    dates: { expiresAt?: Date; usedAt?: Date; revokedAt?: Date },
  ): void {
    const row = this.tokens.get(tokenId);
    if (row) Object.assign(row, dates);
  }

  private load(hash: string): Session | null {
    const row = [...this.tokens.values()].find((r) => r.hash === hash);
    if (!row) return null;
    return Session.restore({
      familyId: row.familyId,
      userId: row.userId,
      token: {
        id: row.id,
        hash: row.hash,
        expiresAt: row.expiresAt,
        usedAt: row.usedAt,
        revokedAt: row.revokedAt,
      },
    });
  }

  private apply(session: Session): void {
    const { used, added, revokedAt } = session.changes();
    if (used) {
      const row = this.tokens.get(used.tokenId);
      if (row) row.usedAt = used.at;
    }
    if (added) {
      this.tokens.set(added.id, {
        id: added.id,
        familyId: session.familyId,
        userId: session.userId,
        hash: added.hash,
        expiresAt: added.expiresAt,
        usedAt: null,
        revokedAt: null,
      });
    }
    if (revokedAt) {
      for (const row of this.tokens.values()) {
        if (row.familyId === session.familyId && row.revokedAt === null) {
          row.revokedAt = revokedAt;
        }
      }
    }
  }
}
