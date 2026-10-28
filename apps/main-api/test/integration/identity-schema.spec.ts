import { randomUUID } from 'node:crypto';
import { query, resetDatabase } from '../support/database.js';

const insertUser = (overrides: Record<string, unknown> = {}) => {
  const user = {
    id: randomUUID(),
    email: 'ana@example.com',
    password_hash: 'scrypt$4$8$3$c2FsdA$aGFzaA',
    role: 'BUYER',
    ...overrides,
  };
  return query(
    'INSERT INTO identity.users (id, email, password_hash, role) VALUES ($1, $2, $3, $4)',
    [user.id, user.email, user.password_hash, user.role],
  );
};

describe('identity.users (PostgreSQL real)', () => {
  beforeEach(resetDatabase);

  it('guarda un usuario con su rol y la fecha de alta', async () => {
    await insertUser();
    const [row] = await query<{
      email: string;
      role: string;
      created_at: Date;
    }>('SELECT email, role::text AS role, created_at FROM identity.users');
    expect(row).toMatchObject({ email: 'ana@example.com', role: 'BUYER' });
    expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(
      10_000,
    );
  });

  it('admite los dos roles', async () => {
    await insertUser({ email: 'a@example.com', role: 'BUYER' });
    await insertUser({ email: 'b@example.com', role: 'ADMIN' });
    expect((await query('SELECT 1 FROM identity.users')).length).toBe(2);
  });

  it('un rol desconocido lo rechaza la base', async () => {
    await expect(insertUser({ role: 'SUPERUSER' })).rejects.toThrow(
      /invalid input value for enum/i,
    );
  });

  it('el correo es único', async () => {
    await insertUser();
    await expect(insertUser()).rejects.toThrow(/unique|duplicate/i);
  });

  it('el correo debe estar en minúsculas: la base lo exige aunque el código falle', async () => {
    await expect(insertUser({ email: 'Ana@Example.com' })).rejects.toThrow(
      /check/i,
    );
  });

  it('y recortado', async () => {
    await expect(insertUser({ email: ' ana@example.com' })).rejects.toThrow(
      /check/i,
    );
  });

  it.each(['password_hash', 'email', 'role'])(
    '%s es obligatorio',
    async (column) => {
      const columns = {
        id: randomUUID(),
        email: 'x@example.com',
        password_hash: 'h',
        role: 'BUYER',
      } as Record<string, unknown>;
      delete columns[column];
      const names = Object.keys(columns);
      await expect(
        query(
          `INSERT INTO identity.users (${names.join(', ')}) VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')})`,
          Object.values(columns),
        ),
      ).rejects.toThrow(/null value|not-null/i);
    },
  );

  it('el id es un UUID', async () => {
    await expect(insertUser({ id: 'no-es-uuid' })).rejects.toThrow(/uuid/i);
  });

  it('la columna del hash no es de las que se devuelven por accidente: se llama password_hash y nada más guarda contraseñas', async () => {
    const columns = await query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'identity' AND table_name = 'users'",
    );
    expect(
      columns.map((c) => c.column_name).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['created_at', 'email', 'id', 'password_hash', 'role']);
  });

  it('los tests empiezan con la tabla vacía: resetDatabase la vacía', async () => {
    await insertUser();
    await resetDatabase();
    expect(await query('SELECT 1 FROM identity.users')).toEqual([]);
  });
});
