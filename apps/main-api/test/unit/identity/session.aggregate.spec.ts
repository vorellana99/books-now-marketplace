import { hashRefreshToken } from '../../../src/contexts/identity/domain/model/session/refresh-token.js';
import {
  Session,
  type RefreshTokenRecord,
} from '../../../src/contexts/identity/domain/model/session/session.aggregate.js';

const USER = '11111111-1111-4111-8111-111111111111';
const FAMILY = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-29T12:00:00.000Z');
const TTL = 14 * 86_400_000;

const token = (
  overrides: Partial<RefreshTokenRecord> = {},
): RefreshTokenRecord => ({
  id: '33333333-3333-4333-8333-333333333333',
  hash: 'a'.repeat(64),
  expiresAt: new Date(NOW.getTime() + 60_000),
  usedAt: null,
  revokedAt: null,
  ...overrides,
});
const restore = (overrides: Partial<RefreshTokenRecord> = {}) =>
  Session.restore({ familyId: FAMILY, userId: USER, token: token(overrides) });

describe('Session.start: abrir una sesión nueva', () => {
  it('crea una familia y un primer token que vence a los TTL milisegundos', () => {
    const { session, refreshToken } = Session.start({
      userId: USER,
      now: NOW,
      ttlMs: TTL,
    });

    const { added } = session.changes();
    expect(session.userId).toBe(USER);
    expect(session.familyId).toMatch(/^[0-9a-f-]{36}$/);
    expect(added?.expiresAt).toEqual(new Date(NOW.getTime() + TTL));
    expect(added?.usedAt).toBeNull();
    expect(added?.revokedAt).toBeNull();
    expect(added?.id).toMatch(/^[0-9a-f-]{36}$/);
    // lo que se entrega al cliente es el texto; lo que se guarda, solo su hash
    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(added?.hash).toBe(hashRefreshToken(refreshToken));
    expect(added?.hash).not.toContain(refreshToken);
  });

  it('cada inicio abre una familia y un token distintos', () => {
    const a = Session.start({ userId: USER, now: NOW, ttlMs: TTL });
    const b = Session.start({ userId: USER, now: NOW, ttlMs: TTL });

    expect(a.session.familyId).not.toBe(b.session.familyId);
    expect(a.refreshToken).not.toBe(b.refreshToken);
  });

  it('abrir una sesión no usa ni revoca nada', () => {
    const { session } = Session.start({ userId: USER, now: NOW, ttlMs: TTL });

    expect(session.changes().used).toBeUndefined();
    expect(session.changes().revokedAt).toBeUndefined();
  });
});

describe('Session.rotate: cambiar un token de refresco por otro', () => {
  it('un token vigente y sin usar se renueva: queda usado y nace uno nuevo de la misma familia', () => {
    const session = restore();

    const outcome = session.rotate(NOW, TTL);

    expect(outcome.kind).toBe('renewed');
    if (outcome.kind !== 'renewed') return;
    expect(outcome.userId).toBe(USER);
    const { used, added, revokedAt } = session.changes();
    expect(used).toEqual({ tokenId: token().id, at: NOW });
    expect(added?.expiresAt).toEqual(new Date(NOW.getTime() + TTL));
    expect(added?.hash).toBe(hashRefreshToken(outcome.refreshToken));
    expect(added?.id).not.toBe(token().id);
    expect(revokedAt).toBeUndefined();
  });

  it('el token nuevo es distinto cada vez', () => {
    const first = restore().rotate(NOW, TTL);
    const second = restore().rotate(NOW, TTL);

    expect(first.kind === 'renewed' && second.kind === 'renewed').toBe(true);
    if (first.kind === 'renewed' && second.kind === 'renewed') {
      expect(first.refreshToken).not.toBe(second.refreshToken);
    }
  });

  describe('un token que no sirve: inválido, y no cambia nada', () => {
    it.each([
      ['revocado', { revokedAt: new Date(NOW.getTime() - 1000) }],
      ['vencido hace un momento', { expiresAt: new Date(NOW.getTime() - 1) }],
      ['que vence justo ahora', { expiresAt: NOW }],
    ])('%s', (_name, overrides) => {
      const session = restore(overrides);

      expect(session.rotate(NOW, TTL)).toEqual({ kind: 'invalid' });
      expect(session.changes()).toEqual({});
    });

    it('uno que vence un milisegundo después todavía sirve', () => {
      const session = restore({ expiresAt: new Date(NOW.getTime() + 1) });

      expect(session.rotate(NOW, TTL).kind).toBe('renewed');
    });

    it('revocado y usado a la vez es inválido, no una reutilización (el cierre de sesión no avisa de robo)', () => {
      const session = restore({
        usedAt: new Date(NOW.getTime() - 5000),
        revokedAt: new Date(NOW.getTime() - 1000),
      });

      expect(session.rotate(NOW, TTL)).toEqual({ kind: 'invalid' });
      expect(session.changes()).toEqual({});
    });

    it('vencido y usado a la vez es inválido, no una reutilización', () => {
      const session = restore({
        usedAt: new Date(NOW.getTime() - 5000),
        expiresAt: new Date(NOW.getTime() - 1),
      });

      expect(session.rotate(NOW, TTL)).toEqual({ kind: 'invalid' });
    });
  });

  describe('un token ya usado que vuelve a presentarse: reutilización', () => {
    it('revoca toda la familia en este momento y avisa de quién y de cuál', () => {
      const session = restore({ usedAt: new Date(NOW.getTime() - 5000) });

      const outcome = session.rotate(NOW, TTL);

      expect(outcome).toEqual({
        kind: 'reused',
        userId: USER,
        familyId: FAMILY,
      });
      expect(session.changes()).toEqual({ revokedAt: NOW });
    });

    it('no nace un token nuevo ni se marca otro uso', () => {
      const session = restore({ usedAt: new Date(NOW.getTime() - 5000) });

      session.rotate(NOW, TTL);

      expect(session.changes().added).toBeUndefined();
      expect(session.changes().used).toBeUndefined();
    });
  });

  it('si tras renovar se presenta el mismo token, la revocación conserva el cambio anterior (el token usado y el nuevo, que también se revoca)', () => {
    const session = restore();

    session.rotate(NOW, TTL);
    session.rotate(NOW, TTL);

    const changes = session.changes();
    expect(changes.revokedAt).toEqual(NOW);
    expect(changes.used?.tokenId).toBe(token().id);
    expect(changes.added).toBeDefined();
  });

  it('presentar dos veces el mismo token en la misma sesión: la segunda es una reutilización', () => {
    const session = restore();

    expect(session.rotate(NOW, TTL).kind).toBe('renewed');
    const again = session.rotate(NOW, TTL);

    expect(again).toEqual({ kind: 'reused', userId: USER, familyId: FAMILY });
  });
});

describe('Session.revoke: cerrar la sesión', () => {
  it('revoca la familia entera en este momento', () => {
    const session = restore();

    session.revoke(NOW);

    expect(session.changes()).toEqual({ revokedAt: NOW });
  });

  it('al abrir una sesión y cerrarla en seguida, el token nuevo sigue entre los cambios y queda revocado', () => {
    const { session } = Session.start({ userId: USER, now: NOW, ttlMs: TTL });

    session.revoke(NOW);

    expect(session.changes().added).toBeDefined();
    expect(session.changes().revokedAt).toEqual(NOW);
  });

  it('también si el token ya se usó: quien cierra sesión no quiere que el sucesor siga sirviendo', () => {
    const session = restore({ usedAt: new Date(NOW.getTime() - 5000) });

    session.revoke(NOW);

    expect(session.changes()).toEqual({ revokedAt: NOW });
  });

  it('si ya estaba revocada, no cambia nada: se conserva el primer momento de la revocación', () => {
    const first = new Date(NOW.getTime() - 60_000);
    const session = restore({ revokedAt: first });

    session.revoke(NOW);

    expect(session.changes()).toEqual({});
  });

  it('un token vencido también se puede cerrar', () => {
    const session = restore({ expiresAt: new Date(NOW.getTime() - 1) });

    session.revoke(NOW);

    expect(session.changes()).toEqual({ revokedAt: NOW });
  });
});

describe('Session.restore', () => {
  it('conserva los datos con los que se carga', () => {
    const session = restore();

    expect(session.familyId).toBe(FAMILY);
    expect(session.userId).toBe(USER);
    expect(session.changes()).toEqual({});
  });
});
