import { randomUUID } from 'node:crypto';
import { query, resetDatabase } from '../support/database.js';

const HASH = 'a'.repeat(64);

const insertUser = async (id = randomUUID(), email = `${id}@example.com`) => {
  await query(
    "INSERT INTO identity.users (id, email, password_hash, role) VALUES ($1, $2, 'scrypt$4$8$3$c2FsdA$aGFzaA', 'BUYER')",
    [id, email],
  );
  return id;
};

const insertToken = (
  userId: string,
  overrides: Record<string, unknown> = {},
) => {
  const token = {
    id: randomUUID(),
    family_id: randomUUID(),
    token_hash: HASH,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    ...overrides,
  };
  return query(
    'INSERT INTO identity.refresh_tokens (id, user_id, family_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5)',
    [token.id, userId, token.family_id, token.token_hash, token.expires_at],
  );
};

describe('identity.refresh_tokens (PostgreSQL real)', () => {
  beforeEach(resetDatabase);

  it('guarda un token con su familia, su vencimiento y sin usar ni revocar', async () => {
    const userId = await insertUser();
    await insertToken(userId);

    const [row] = await query<{
      created_at: Date;
      expires_at: Date;
      used_at: Date | null;
      revoked_at: Date | null;
    }>(
      'SELECT created_at, expires_at, used_at, revoked_at FROM identity.refresh_tokens',
    );
    expect(row.used_at).toBeNull();
    expect(row.revoked_at).toBeNull();
    expect(row.expires_at.getTime()).toBeGreaterThan(row.created_at.getTime());
  });

  it('el hash es único: dos tokens no pueden compartirlo', async () => {
    const userId = await insertUser();
    await insertToken(userId);
    await expect(insertToken(userId)).rejects.toThrow(
      /refresh_tokens_token_hash_key/,
    );
  });

  it('exige un usuario que exista', async () => {
    await expect(insertToken(randomUUID())).rejects.toThrow(
      /refresh_tokens_user_id_fkey/,
    );
  });

  it('al borrar al usuario se borran sus tokens, y solo los suyos', async () => {
    const ana = await insertUser();
    const luis = await insertUser();
    await insertToken(ana, { token_hash: 'a'.repeat(64) });
    await insertToken(luis, { token_hash: 'b'.repeat(64) });

    await query('DELETE FROM identity.users WHERE id = $1', [ana]);

    const rows = await query<{ user_id: string }>(
      'SELECT user_id FROM identity.refresh_tokens',
    );
    expect(rows).toEqual([{ user_id: luis }]);
  });

  it.each([
    ['más corto', 'a'.repeat(63)],
    ['más largo', 'a'.repeat(65)],
    ['en mayúsculas', 'A'.repeat(64)],
    ['con caracteres que no son hexadecimales', 'g'.repeat(64)],
    [
      'un token en claro (base64url de 43 caracteres)',
      'Zx_-'.repeat(10) + 'abc',
    ],
  ])(
    'rechaza un hash %s: la base no admite un token en claro',
    async (_why, hash) => {
      const userId = await insertUser();
      await expect(insertToken(userId, { token_hash: hash })).rejects.toThrow(
        /refresh_tokens_hash_format/,
      );
    },
  );

  it('rechaza un token que vence antes (o cuando) se crea', async () => {
    const userId = await insertUser();
    await expect(
      insertToken(userId, {
        expires_at: new Date(Date.now() - 1000).toISOString(),
      }),
    ).rejects.toThrow(/refresh_tokens_expires_after_created/);
  });

  it('resetDatabase también vacía esta tabla', async () => {
    await insertToken(await insertUser());
    await resetDatabase();
    expect(await query('SELECT 1 FROM identity.refresh_tokens')).toEqual([]);
  });
});
