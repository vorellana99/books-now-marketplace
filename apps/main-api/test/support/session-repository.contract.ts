import { randomUUID } from 'node:crypto';
import type { SessionRepository } from '../../src/contexts/identity/domain/ports/session.repository.js';
import { hashRefreshToken } from '../../src/contexts/identity/domain/model/session/refresh-token.js';
import { Session } from '../../src/contexts/identity/domain/model/session/session.aggregate.js';

export interface TokenRow {
  id: string;
  familyId: string;
  userId: string;
  hash: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

// Lo que cada implementación aporta además del puerto, para preparar y mirar el estado sin pasar por él
export interface SessionRepositorySubject {
  repo: SessionRepository;
  prepare(userId: string): Promise<void>; // lo que la implementación necesite para aceptar sesiones de ese usuario
  rows(): Promise<TokenRow[]>; // todos los tokens guardados
  setDates(
    tokenId: string,
    dates: { expiresAt?: Date; usedAt?: Date; revokedAt?: Date },
  ): Promise<void>; // envejece un token
}

const TTL = 14 * 86_400_000;
const DAY = 86_400_000;

// La misma batería para el fake en memoria y para el adaptador de Prisma: así el fake con el que se prueban los casos de
// uso no se desvía de lo real. Cada test pide un sujeto nuevo
export function sessionRepositoryContract(
  name: string,
  create: () => Promise<SessionRepositorySubject>,
): void {
  describe(`SessionRepository: contrato (${name})`, () => {
    async function open(s: SessionRepositorySubject, userId = randomUUID()) {
      await s.prepare(userId);
      const started = Session.start({ userId, now: new Date(), ttlMs: TTL });
      await s.repo.open(started.session);
      return { userId, ...started };
    }
    const hashOf = (token: string) => hashRefreshToken(token);
    const byHash = async (s: SessionRepositorySubject, token: string) =>
      (await s.rows()).find((r) => r.hash === hashOf(token));

    describe('open', () => {
      it('guarda el primer token de la sesión, solo con su hash', async () => {
        const s = await create();

        const { userId, session, refreshToken } = await open(s);

        const rows = await s.rows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          userId,
          familyId: session.familyId,
          hash: hashOf(refreshToken),
          usedAt: null,
          revokedAt: null,
        });
        expect(JSON.stringify(rows)).not.toContain(refreshToken);
      });

      it('cada sesión es una familia distinta', async () => {
        const s = await create();
        const userId = randomUUID();

        await open(s, userId);
        await open(s, userId);

        const families = new Set((await s.rows()).map((r) => r.familyId));
        expect(families.size).toBe(2);
      });
    });

    describe('rotate', () => {
      it('con un token desconocido, decide recibe null, el resultado de decide vuelve y no se guarda nada', async () => {
        const s = await create();
        await open(s);
        const decide = vi.fn(() => 'respuesta');

        const result = await s.repo.rotate(hashOf('desconocido'), decide);

        expect(result).toBe('respuesta');
        expect(decide).toHaveBeenCalledWith(null);
        expect(await s.rows()).toHaveLength(1);
      });

      it('con un token conocido, decide recibe la sesión de ese token', async () => {
        const s = await create();
        const { userId, session, refreshToken } = await open(s);
        let seen: Session | null = null;

        await s.repo.rotate(hashOf(refreshToken), (found) => {
          seen = found;
        });

        expect(seen).not.toBeNull();
        expect((seen as unknown as Session).userId).toBe(userId);
        expect((seen as unknown as Session).familyId).toBe(session.familyId);
      });

      it('una renovación guarda el token usado y el token nuevo de la misma familia', async () => {
        const s = await create();
        const { userId, session, refreshToken } = await open(s);

        const outcome = await s.repo.rotate(hashOf(refreshToken), (found) =>
          found?.rotate(new Date(), TTL),
        );

        expect(outcome?.kind).toBe('renewed');
        const rows = await s.rows();
        expect(rows).toHaveLength(2);
        const old = await byHash(s, refreshToken);
        expect(old?.usedAt).not.toBeNull();
        const fresh = rows.find((r) => r.id !== old?.id);
        expect(fresh).toMatchObject({
          userId,
          familyId: session.familyId,
          usedAt: null,
          revokedAt: null,
        });
        if (outcome?.kind === 'renewed') {
          expect(fresh?.hash).toBe(hashOf(outcome.refreshToken));
        }
      });

      it('se puede encadenar: el token nuevo se renueva a su vez', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        const first = await s.repo.rotate(hashOf(refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );
        if (first?.kind !== 'renewed') throw new Error('debía renovar');

        const second = await s.repo.rotate(hashOf(first.refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        expect(second?.kind).toBe('renewed');
        expect(await s.rows()).toHaveLength(3);
      });

      it('una reutilización revoca la familia entera, también el token nuevo, y se guarda aunque decide devuelva el resultado', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        await s.repo.rotate(hashOf(refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        const outcome = await s.repo.rotate(hashOf(refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        expect(outcome?.kind).toBe('reused');
        const rows = await s.rows();
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      });

      it('una reutilización no toca las otras familias, ni del mismo usuario ni de otros', async () => {
        const s = await create();
        const a = await open(s);
        const other = await open(s, a.userId);
        const stranger = await open(s);
        await s.repo.rotate(hashOf(a.refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        await s.repo.rotate(hashOf(a.refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        for (const untouched of [other, stranger]) {
          const row = await byHash(s, untouched.refreshToken);
          expect(row?.revokedAt).toBeNull();
          expect(row?.usedAt).toBeNull();
        }
      });

      it('una reutilización conserva el momento en que un token de la familia ya estaba revocado', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        const rotate = async (token: string) => {
          const outcome = await s.repo.rotate(hashOf(token), (f) =>
            f?.rotate(new Date(), TTL),
          );
          return outcome?.kind === 'renewed' ? outcome.refreshToken : token;
        };
        const second = await rotate(refreshToken);
        const third = await rotate(second);
        const earlier = new Date(Date.now() - 2 * DAY);
        // el primer token aparece revocado desde antes; el segundo, usado y sin revocar, se presenta de nuevo
        await s.setDates((await byHash(s, refreshToken))?.id as string, {
          revokedAt: earlier,
        });

        const outcome = await s.repo.rotate(hashOf(second), (f) =>
          f?.rotate(new Date(), TTL),
        );

        expect(outcome?.kind).toBe('reused');
        expect((await byHash(s, refreshToken))?.revokedAt?.toISOString()).toBe(
          earlier.toISOString(),
        );
        for (const token of [second, third]) {
          const row = await byHash(s, token);
          expect(row?.revokedAt?.getTime()).toBeGreaterThan(earlier.getTime());
        }
      });

      it('un token inválido (vencido) no guarda nada', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        const row = await byHash(s, refreshToken);
        await s.setDates(row?.id as string, {
          expiresAt: new Date(Date.now() - 1000),
        });

        const outcome = await s.repo.rotate(hashOf(refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        expect(outcome).toEqual({ kind: 'invalid' });
        expect(await s.rows()).toHaveLength(1);
        expect((await s.rows())[0]?.usedAt).toBeNull();
      });

      it('si decide falla, no se guarda nada y el error sube (el token viejo no queda usado)', async () => {
        const s = await create();
        const { refreshToken } = await open(s);

        await expect(
          s.repo.rotate(hashOf(refreshToken), async (f) => {
            f?.rotate(new Date(), TTL);
            await Promise.resolve();
            throw new Error('falló al entregar el token nuevo');
          }),
        ).rejects.toThrow('falló al entregar el token nuevo');

        const rows = await s.rows();
        expect(rows).toHaveLength(1);
        expect(rows[0]?.usedAt).toBeNull();
        // y el token sigue sirviendo
        const again = await s.repo.rotate(hashOf(refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );
        expect(again?.kind).toBe('renewed');
      });

      it('decide puede ser asíncrona: se espera su resultado antes de guardar', async () => {
        const s = await create();
        const { refreshToken } = await open(s);

        const outcome = await s.repo.rotate(hashOf(refreshToken), async (f) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          return f?.rotate(new Date(), TTL);
        });

        expect(outcome?.kind).toBe('renewed');
        expect(await s.rows()).toHaveLength(2);
      });

      it('dos renovaciones simultáneas con el mismo token: solo una renueva, la otra es una reutilización y la familia queda revocada', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        const renew = () =>
          s.repo.rotate(hashOf(refreshToken), async (f) => {
            await new Promise((resolve) => setTimeout(resolve, 15)); // ensancha la ventana en la que se cruzarían
            return f?.rotate(new Date(), TTL);
          });

        const outcomes = await Promise.all([renew(), renew(), renew()]);

        // la primera entra; la segunda ve el token usado y revoca la familia (reutilización); la tercera ya lo encuentra
        // revocado (inválido): para quien llama, las dos fallan igual
        const kinds = outcomes.map((o) => o?.kind);
        expect(kinds.filter((k) => k === 'renewed')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'reused')).toHaveLength(1);
        expect(kinds.filter((k) => k === 'invalid')).toHaveLength(1);
        const rows = await s.rows();
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
      });
    });

    describe('revoke', () => {
      it('revoca la familia entera, también si el token ya se usó', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        const renewed = await s.repo.rotate(hashOf(refreshToken), (f) =>
          f?.rotate(new Date(), TTL),
        );

        await s.repo.revoke(hashOf(refreshToken), new Date());

        const rows = await s.rows();
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
        expect(renewed?.kind).toBe('renewed');
      });

      it('no toca las otras sesiones', async () => {
        const s = await create();
        const a = await open(s);
        const other = await open(s, a.userId);

        await s.repo.revoke(hashOf(a.refreshToken), new Date());

        expect((await byHash(s, other.refreshToken))?.revokedAt).toBeNull();
      });

      it('con un token desconocido no hace nada ni falla', async () => {
        const s = await create();
        await open(s);

        await expect(
          s.repo.revoke(hashOf('desconocido'), new Date()),
        ).resolves.toBeUndefined();

        expect((await s.rows())[0]?.revokedAt).toBeNull();
      });

      it('repetirlo conserva el primer momento de la revocación', async () => {
        const s = await create();
        const { refreshToken } = await open(s);
        const first = new Date(Date.now() - 60_000);

        await s.repo.revoke(hashOf(refreshToken), first);
        await s.repo.revoke(hashOf(refreshToken), new Date());

        const row = await byHash(s, refreshToken);
        expect(row?.revokedAt?.getTime()).toBe(first.getTime());
      });
    });

    describe('purgeFinished (retención)', () => {
      async function tokenWith(
        s: SessionRepositorySubject,
        dates: { expiresAt?: Date; usedAt?: Date; revokedAt?: Date },
      ) {
        const { refreshToken } = await open(s);
        const row = await byHash(s, refreshToken);
        await s.setDates(row?.id as string, {
          expiresAt: new Date(Date.now() + DAY),
          ...dates,
        });
        return row?.id as string;
      }
      const ids = async (s: SessionRepositorySubject) =>
        (await s.rows()).map((r) => r.id);

      it('borra los que vencieron, se usaron o se revocaron hace más del plazo, y devuelve cuántos', async () => {
        const s = await create();
        const expired = await tokenWith(s, {
          expiresAt: new Date(Date.now() - 8 * DAY),
        });
        const used = await tokenWith(s, {
          usedAt: new Date(Date.now() - 8 * DAY),
        });
        const revoked = await tokenWith(s, {
          revokedAt: new Date(Date.now() - 8 * DAY),
        });

        expect(await s.repo.purgeFinished(7, 100)).toBe(3);

        const left = await ids(s);
        for (const id of [expired, used, revoked])
          expect(left).not.toContain(id);
      });

      it('conserva los recientes y los vigentes, por antiguos que sean de creación', async () => {
        const s = await create();
        const recent = await tokenWith(s, {
          usedAt: new Date(Date.now() - 6 * DAY),
        });
        const valid = await tokenWith(s, {});

        expect(await s.repo.purgeFinished(7, 100)).toBe(0);

        expect(await ids(s)).toEqual(expect.arrayContaining([recent, valid]));
      });

      it('borra como mucho `limit` por llamada', async () => {
        const s = await create();
        for (let i = 0; i < 5; i++) {
          await tokenWith(s, { usedAt: new Date(Date.now() - 30 * DAY) });
        }

        expect(await s.repo.purgeFinished(7, 2)).toBe(2);
        expect(await s.repo.purgeFinished(7, 2)).toBe(2);
        expect(await s.repo.purgeFinished(7, 2)).toBe(1);
        expect(await s.repo.purgeFinished(7, 2)).toBe(0);
      });
    });
  });
}
