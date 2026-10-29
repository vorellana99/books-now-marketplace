import { Module, type INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterUserCommand } from '../../src/contexts/identity/application/register-user.command.js';
import { PasswordHasher } from '../../src/contexts/identity/domain/ports/password-hasher.port.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { RegisterUserHandler } from '../../src/contexts/identity/infrastructure/register-user.handler.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import {
  ConflictError,
  DomainError,
} from '../../src/shared-kernel/domain.errors.js';
import { deliveryRows, outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { UserRegisteredProbe } from '../support/outbox-probes.js';

@Module({ providers: [UserRegisteredProbe] })
class Probes {}

const PASSWORD = 'una contraseña larga y buena';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('RegisterUserHandler (PostgreSQL real, por el CommandBus)', () => {
  let app: INestApplication;
  let commandBus: CommandBus;
  let prisma: PrismaService;
  let hasher: PasswordHasher;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, IdentityModule, Probes);
    commandBus = app.get(CommandBus);
    prisma = app.get(PrismaService);
    hasher = app.get(PasswordHasher);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const register = (email = 'ana@example.com', password = PASSWORD) =>
    commandBus.execute(new RegisterUserCommand(email, password));
  const users = () =>
    query<{ id: string; email: string; password_hash: string; role: string }>(
      'SELECT id, email, password_hash, role::text AS role FROM identity.users ORDER BY email',
    );

  describe('el usuario', () => {
    it('se guarda como comprador, con el correo normalizado y su id', async () => {
      const registered = await register('  Ana@Example.COM ');

      expect(registered.id).toMatch(UUID);
      expect(await users()).toMatchObject([
        { id: registered.id, email: 'ana@example.com', role: 'BUYER' },
      ]);
    });

    it('devuelve solo el id, el correo y el rol: ni la contraseña ni su hash', async () => {
      const registered = await register();

      expect(registered).toEqual({
        id: expect.stringMatching(UUID),
        email: 'ana@example.com',
        role: 'BUYER',
      });
      expect(JSON.stringify(registered)).not.toContain(PASSWORD);
      expect(JSON.stringify(registered)).not.toContain('scrypt');
    });

    it('guarda un hash que verifica con la contraseña, no la contraseña', async () => {
      await register();

      const [row] = await users();
      expect(row.password_hash).not.toContain(PASSWORD);
      expect(row.password_hash.startsWith('scrypt$')).toBe(true);
      expect(await hasher.verify(PASSWORD, row.password_hash)).toBe(true);
      expect(
        await hasher.verify('otra contraseña distinta', row.password_hash),
      ).toBe(false);
    });

    it('la contraseña no se recorta: los espacios forman parte de ella', async () => {
      await register('ana@example.com', `  ${PASSWORD}  `);

      const [row] = await users();
      expect(await hasher.verify(`  ${PASSWORD}  `, row.password_hash)).toBe(
        true,
      );
      expect(await hasher.verify(PASSWORD, row.password_hash)).toBe(false);
    });

    it('dos usuarios con la misma contraseña tienen hashes distintos', async () => {
      await register('ana@example.com');
      await register('luis@example.com');

      const [ana, luis] = await users();
      expect(ana.password_hash).not.toBe(luis.password_hash);
    });

    it('cada registro tiene un id distinto', async () => {
      const [a, b] = [
        await register('ana@example.com'),
        await register('luis@example.com'),
      ];
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('reglas', () => {
    it.each(['ANA@example.com', ' ana@example.com ', 'Ana@Example.Com'])(
      'un correo que ya existe (%j, aunque cambien mayúsculas o espacios) da ConflictError EMAIL_ALREADY_REGISTERED y no cambia al usuario',
      async (again) => {
        await register('ana@example.com');
        const [before] = await users();

        const error = await register(again, 'otra contraseña buena').catch(
          (e: unknown) => e,
        );

        expect(error).toBeInstanceOf(ConflictError);
        expect((error as ConflictError).code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(await users()).toEqual([before]);
        expect(await outboxRows()).toHaveLength(1);
      },
    );

    it('el error de un correo repetido no repite la contraseña ni el hash', async () => {
      await register('ana@example.com');
      const error = (await register(
        'ana@example.com',
        'otra contraseña buena',
      ).catch((e: unknown) => e)) as ConflictError;
      expect(error.message).not.toContain('otra contraseña buena');
      expect(error.message).not.toContain('scrypt');
    });

    it('registros simultáneos del mismo correo: entra uno y los demás reciben el conflicto', async () => {
      const results = await Promise.allSettled([
        register('ana@example.com'),
        register('ana@example.com'),
        register('ANA@example.com'),
        register(' ana@example.com'),
      ]);

      const failed = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(failed.map((f) => (f.reason as DomainError).code)).toEqual([
        'EMAIL_ALREADY_REGISTERED',
        'EMAIL_ALREADY_REGISTERED',
        'EMAIL_ALREADY_REGISTERED',
      ]);
      expect(await users()).toHaveLength(1);
      expect(await outboxRows()).toHaveLength(1);
    });

    it.each([
      '',
      'sin-arroba',
      'a@b',
      'ana @example.com',
      'a'.repeat(300) + '@x.com',
    ])(
      'un correo inválido (%j) da INVALID_EMAIL y no guarda nada',
      async (email) => {
        const error = await register(email).catch((e: unknown) => e);

        expect((error as DomainError).code).toBe('INVALID_EMAIL');
        expect(await users()).toEqual([]);
        expect(await outboxRows()).toEqual([]);
      },
    );

    it.each([
      ['corta', 'corta'],
      ['de 9 caracteres', '123456789'],
      ['común', 'password123'],
      ['un solo carácter repetido', 'aaaaaaaaaaaa'],
      ['de más de 128 caracteres', 'x1'.repeat(65)],
      ['igual al correo', 'ana@example.com'],
    ])(
      'una contraseña %s da WEAK_PASSWORD y no guarda nada',
      async (_why, password) => {
        const error = await register('ana@example.com', password).catch(
          (e: unknown) => e,
        );

        expect((error as DomainError).code).toBe('WEAK_PASSWORD');
        expect(await users()).toEqual([]);
        expect(await outboxRows()).toEqual([]);
      },
    );

    it('una contraseña débil no llega a calcular el hash (es caro)', async () => {
      const hash = vi.spyOn(hasher, 'hash');
      try {
        await register('ana@example.com', 'corta').catch(() => undefined);
        expect(hash).not.toHaveBeenCalled();
      } finally {
        hash.mockRestore();
      }
    });

    it('un correo inválido tampoco calcula el hash', async () => {
      const hash = vi.spyOn(hasher, 'hash');
      try {
        await register('sin-arroba').catch(() => undefined);
        expect(hash).not.toHaveBeenCalled();
      } finally {
        hash.mockRestore();
      }
    });

    it.each([undefined, null, 42, {}])(
      'lo que no es texto (%j) da un error de dominio, no una excepción técnica',
      async (value) => {
        const raw = (email: unknown, password: unknown) =>
          commandBus
            .execute(
              new RegisterUserCommand(email as string, password as string),
            )
            .catch((e: unknown) => e);
        expect(await raw(value, PASSWORD)).toBeInstanceOf(DomainError);
        expect(await raw('ana@example.com', value)).toBeInstanceOf(DomainError);
        expect(await users()).toEqual([]);
      },
    );
  });

  describe('el evento identity.user.registered', () => {
    it('se guarda con el usuario y una entrega para su consumidor, con el id como agregado', async () => {
      const registered = await register();

      const [event] = await outboxRows();
      expect(event).toMatchObject({
        event_name: 'identity.user.registered',
        event_version: 1,
        aggregate_id: registered.id,
      });
      expect((await deliveryRows(event.id)).map((d) => d.consumer)).toEqual([
        'test.user-registered',
      ]);
    });

    it('lleva el id, el correo y el rol, y nada de la contraseña', async () => {
      const registered = await register();

      const [event] = await outboxRows();
      expect(event.payload).toMatchObject({
        userId: registered.id,
        email: 'ana@example.com',
        role: 'BUYER',
      });
      expect(
        Object.keys(event.payload).sort((a, b) => a.localeCompare(b)),
      ).toEqual([
        'aggregateId',
        'email',
        'eventName',
        'eventVersion',
        'occurredOn',
        'role',
        'userId',
      ]);
      const text = JSON.stringify(event.payload);
      expect(text).not.toContain(PASSWORD);
      expect(text).not.toContain('scrypt');
    });

    it('lleva el correo normalizado, no como lo escribió quien se registra', async () => {
      await register('  Ana@Example.COM ');
      const [event] = await outboxRows();
      expect(event.payload.email).toBe('ana@example.com');
    });

    it('lleva el requestId de la petición', async () => {
      await RequestContext.run('r-registro', () => register());
      expect((await outboxRows())[0].correlation_id).toBe('r-registro');
    });

    // El usuario y su evento se confirman juntos: sin el evento, Ventas nunca crearía a su cliente
    it('si falla el guardado del evento, no queda el usuario', async () => {
      const failing = new RegisterUserHandler(prisma, hasher, {
        append: async () => {
          throw new Error('falló el outbox');
        },
      } as unknown as OutboxWriter);

      await expect(
        failing.execute(new RegisterUserCommand('ana@example.com', PASSWORD)),
      ).rejects.toThrow('falló el outbox');

      expect(await users()).toEqual([]);
    });

    it('si el outbox escribe el evento y luego falla, el evento también se deshace', async () => {
      const real = app.get(OutboxWriter);
      const failing = new RegisterUserHandler(prisma, hasher, {
        append: async (tx: never, events: never) => {
          await real.append(tx, events);
          throw new Error('falló tras escribir');
        },
      } as unknown as OutboxWriter);

      await expect(
        failing.execute(new RegisterUserCommand('ana@example.com', PASSWORD)),
      ).rejects.toThrow('falló tras escribir');

      expect(await users()).toEqual([]);
      expect(await outboxRows()).toEqual([]);
    });
  });

  it('registrar un usuario no toca las tablas de Ventas (lo hace su consumidor)', async () => {
    await register();
    expect(await query('SELECT 1 FROM sales.customers')).toEqual([]);
  });
});
