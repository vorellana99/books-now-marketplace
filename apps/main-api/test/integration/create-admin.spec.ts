import { spawnSync } from 'node:child_process';
import { PasswordHasher } from '../../src/contexts/identity/domain/ports/password-hasher.port.js';
import { ScryptPasswordHasher } from '../../src/contexts/identity/infrastructure/scrypt-password-hasher.js';
import { createAdminUser } from '../../src/contexts/identity/application/create-admin.js';
import { PrismaUserRepository } from '../../src/contexts/identity/infrastructure/persistence/prisma-user.repository.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import type { INestApplication } from '@nestjs/common';

const PASSWORD = 'una contraseña larga y buena';
const hasher: PasswordHasher = new ScryptPasswordHasher({ logN: 4 });

const users = () =>
  query<{ id: string; email: string; role: string; password_hash: string }>(
    'SELECT id, email, role::text AS role, password_hash FROM identity.users ORDER BY email',
  );

describe('createAdminUser (PostgreSQL real)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await createTestApp(OutboxModule);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const create = (email = 'root@example.com', password = PASSWORD) =>
    createAdminUser({
      users: new PrismaUserRepository(prisma, app.get(OutboxWriter)),
      hasher,
      email,
      password,
    });

  it('crea un usuario con el rol ADMIN y el correo normalizado, y devuelve su id y correo', async () => {
    const created = await create('  Root@Example.COM ');

    expect(created).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email: 'root@example.com',
    });
    expect(await users()).toMatchObject([
      { id: created.id, email: 'root@example.com', role: 'ADMIN' },
    ]);
  });

  it('guarda un hash que verifica con la contraseña, y no la contraseña', async () => {
    await create();
    const [row] = await users();
    expect(row.password_hash).not.toContain(PASSWORD);
    expect(await hasher.verify(PASSWORD, row.password_hash)).toBe(true);
    expect(
      await hasher.verify('otra contraseña buena', row.password_hash),
    ).toBe(false);
  });

  it('no devuelve la contraseña ni el hash', async () => {
    const created = await create();
    expect(JSON.stringify(created)).not.toContain(PASSWORD);
    expect(JSON.stringify(created)).not.toContain('scrypt');
  });

  it('un administrador no es un cliente: no escribe ningún evento ni toca Ventas', async () => {
    await create();
    expect(await query('SELECT 1 FROM messaging.outbox')).toEqual([]);
    expect(await query('SELECT 1 FROM sales.customers')).toEqual([]);
  });

  it('un correo que ya existe (aunque sea de un comprador) da EMAIL_ALREADY_REGISTERED y no cambia al usuario', async () => {
    await query(
      "INSERT INTO identity.users (id, email, password_hash, role) VALUES (gen_random_uuid(), 'root@example.com', 'scrypt$4$8$3$c2FsdA$aGFzaA', 'BUYER')",
    );
    const [before] = await users();

    const error = await create('ROOT@example.com').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).code).toBe('EMAIL_ALREADY_REGISTERED');
    expect(await users()).toEqual([before]);
  });

  it.each(['', 'sin-arroba', 'a@b'])(
    'un correo inválido (%j) da INVALID_EMAIL y no crea nada',
    async (email) => {
      const error = await create(email).catch((e: unknown) => e);
      expect((error as DomainError).code).toBe('INVALID_EMAIL');
      expect(await users()).toEqual([]);
    },
  );

  it.each(['corta', 'password123', 'aaaaaaaaaaaa', 'root@example.com'])(
    'una contraseña débil (%j, también la igual al correo) da WEAK_PASSWORD y no crea nada',
    async (password) => {
      const error = await create('root@example.com', password).catch(
        (e: unknown) => e,
      );
      expect((error as DomainError).code).toBe('WEAK_PASSWORD');
      expect(await users()).toEqual([]);
    },
  );
});

// El comando que usa quien administra: pnpm run admin:create
describe('pnpm run admin:create (PostgreSQL real)', () => {
  beforeEach(resetDatabase);

  const run = (
    env: Record<string, string | undefined>,
    input?: string,
    args: string[] = [],
  ) => {
    const result = spawnSync('pnpm', ['run', 'admin:create', ...args], {
      env: { ...process.env, ADMIN_EMAIL: '', ADMIN_PASSWORD: '', ...env },
      input,
      encoding: 'utf8',
    });
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
    };
  };

  it('con ADMIN_EMAIL y ADMIN_PASSWORD crea al administrador y dice su id', async () => {
    const result = run({
      ADMIN_EMAIL: 'root@example.com',
      ADMIN_PASSWORD: PASSWORD,
    });

    expect(result.status).toBe(0);
    const [row] = await users();
    expect(row).toMatchObject({ email: 'root@example.com', role: 'ADMIN' });
    expect(result.output).toContain(row.id);
    expect(result.output).toContain('root@example.com');
    expect(await hasher.verify(PASSWORD, row.password_hash)).toBe(true);
    expect(row.password_hash.startsWith('scrypt$4$')).toBe(true); // el costo de PASSWORD_HASH_LOG_N
  });

  it('el correo puede venir como --email=', async () => {
    const result = run({ ADMIN_PASSWORD: PASSWORD }, undefined, [
      '--',
      '--email=otro@example.com',
    ]);
    expect(result.status).toBe(0);
    expect((await users())[0].email).toBe('otro@example.com');
  });

  it('sin ADMIN_PASSWORD la lee de la entrada estándar, dos veces', async () => {
    const result = run(
      { ADMIN_EMAIL: 'root@example.com' },
      `${PASSWORD}\n${PASSWORD}\n`,
    );

    expect(result.status).toBe(0);
    expect(await users()).toHaveLength(1);
  });

  it('si las dos contraseñas no coinciden no crea nada', async () => {
    const result = run(
      { ADMIN_EMAIL: 'root@example.com' },
      `${PASSWORD}\notra contraseña distinta\n`,
    );

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/no coinciden/);
    expect(await users()).toEqual([]);
  });

  it('sin contraseña (ni variable ni entrada) falla sin crear nada', async () => {
    const result = run({ ADMIN_EMAIL: 'root@example.com' }, '');
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/Falta la contraseña/);
    expect(await users()).toEqual([]);
  });

  it('sin correo falla y lo pide', async () => {
    const result = run({ ADMIN_PASSWORD: PASSWORD });
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/correo/i);
    expect(await users()).toEqual([]);
  });

  it('una contraseña débil falla con un mensaje claro, sin crear nada', async () => {
    const result = run({
      ADMIN_EMAIL: 'root@example.com',
      ADMIN_PASSWORD: 'corta',
    });
    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/Contraseña débil/);
    expect(await users()).toEqual([]);
  });

  it('un correo repetido falla y no cambia al usuario', async () => {
    const env = { ADMIN_EMAIL: 'root@example.com', ADMIN_PASSWORD: PASSWORD };
    expect(run(env).status).toBe(0);
    const before = await users();

    const second = run({ ...env, ADMIN_PASSWORD: 'otra contraseña buena' });

    expect(second.status).not.toBe(0);
    expect(second.output).toMatch(/ya existe/i);
    expect(await users()).toEqual(before);
  });

  it('nunca escribe la contraseña ni su hash en la salida, ni en éxito ni en error', async () => {
    const ok = run({
      ADMIN_EMAIL: 'root@example.com',
      ADMIN_PASSWORD: PASSWORD,
    });
    const bad = run({
      ADMIN_EMAIL: 'root@example.com',
      ADMIN_PASSWORD: PASSWORD,
    });
    const [row] = await users();
    for (const result of [ok, bad]) {
      expect(result.output).not.toContain(PASSWORD);
      expect(result.output).not.toContain(row.password_hash);
    }
  });

  it('un fallo de la base no vuelca la operación: ni la contraseña ni su hash salen en el mensaje', () => {
    const result = run({
      DB_PORT: '1',
      ADMIN_EMAIL: 'root@example.com',
      ADMIN_PASSWORD: PASSWORD,
    });

    expect(result.status).not.toBe(0);
    expect(result.output).toMatch(/Error inesperado/);
    expect(result.output).not.toContain(PASSWORD);
    expect(result.output).not.toContain('scrypt$');
    expect(result.output).not.toContain('passwordHash');
    // El texto que trae el error de la base (la llamada con sus datos) no se muestra
    expect(result.output).not.toMatch(/invocation|prisma\.user\.create/);
  });

  it('puede correr con NODE_ENV=production: es la forma de crear al primer administrador', async () => {
    const result = run({
      NODE_ENV: 'production',
      ADMIN_EMAIL: 'root@example.com',
      ADMIN_PASSWORD: PASSWORD,
    });
    expect(result.status).toBe(0);
    expect(await users()).toHaveLength(1);
  });
});
