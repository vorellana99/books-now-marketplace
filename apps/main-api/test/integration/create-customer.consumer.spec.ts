import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { RegisterUserCommand } from '../../src/contexts/identity/application/use-cases/user/register-user.command.js';
import { IdentityModule } from '../../src/contexts/identity/identity.module.js';
import { CreateCustomerConsumer } from '../../src/contexts/sales/infrastructure/consumers/create-customer.consumer.js';
import { SalesModule } from '../../src/contexts/sales/sales.module.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxRegistry } from '../../src/platform/outbox/outbox.registry.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { deliveryRows, outboxRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';

const PASSWORD = 'una contraseña larga y buena';

describe('CreateCustomerConsumer: el cliente de cada comprador (relay y PostgreSQL reales)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let commandBus: CommandBus;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp(OutboxModule, IdentityModule, SalesModule);
    relay = app.get(OutboxRelay);
    commandBus = app.get(CommandBus);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(resetDatabase);

  const register = (email: string) =>
    commandBus.execute(new RegisterUserCommand(email, PASSWORD));
  const customers = () =>
    query<{ id: string; email: string; premium: boolean }>(
      'SELECT id, email, premium FROM sales.customers ORDER BY email',
    );
  // Entrega el evento al consumidor directamente, dentro de una transacción, como lo haría el relay
  const deliver = (event: Record<string, unknown>, fail = false) =>
    prisma.$transaction(async (tx) => {
      await app.get(CreateCustomerConsumer).handle(event as never, {
        tx,
        eventId: randomUUID(),
        occurredOn: new Date(),
        attempt: 1,
        correlationId: null,
      });
      if (fail) throw new Error('se deshace');
    });
  const event = (
    overrides: Partial<{ userId: string; email: string; role: string }> = {},
  ): Record<string, unknown> => ({
    eventName: 'identity.user.registered',
    eventVersion: 1,
    userId: randomUUID(),
    email: 'ana@example.com',
    role: 'BUYER',
    ...overrides,
  });

  it('es un consumidor db de identity.user.registered, registrado en el relay', () => {
    expect(
      app.get(OutboxRegistry).consumersOf('identity.user.registered'),
    ).toEqual(['sales.create-customer']);
    expect(app.get(CreateCustomerConsumer)).toMatchObject({
      kind: 'db',
      name: 'sales.create-customer',
      event: 'identity.user.registered',
    });
  });

  describe('al registrarse un comprador', () => {
    it('el relay le crea el cliente con el mismo id y correo, no premium, y deja la entrega DONE', async () => {
      const user = await register('Ana@Example.com');
      expect(await customers()).toEqual([]); // todavía no: lo hace el relay

      await relay.runOnce();

      expect(await customers()).toEqual([
        { id: user.id, email: 'ana@example.com', premium: false },
      ]);
      const [outbox] = await outboxRows();
      expect((await deliveryRows(outbox.id)).map((d) => d.status)).toEqual([
        'DONE',
      ]);
    });

    it('cada comprador tiene su cliente, y solo el suyo', async () => {
      const [ana, luis] = [
        await register('ana@example.com'),
        await register('luis@example.com'),
      ];

      await relay.runOnce();

      expect((await customers()).map((c) => c.id).sort()).toEqual(
        [ana.id, luis.id].sort(),
      );
    });

    it('el cliente referencia al usuario por el id, sin tabla ni columna que los ligue', async () => {
      await register('ana@example.com');
      await relay.runOnce();
      const columns = await query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'sales' AND table_name = 'customers' ORDER BY 1",
      );
      expect(columns.map((c) => c.column_name)).toEqual([
        'email',
        'id',
        'premium',
      ]);
    });

    it('registrar no toca las tablas de Ventas hasta que el relay entrega', async () => {
      await register('ana@example.com');
      expect(await query('SELECT 1 FROM sales.customers')).toEqual([]);
    });
  });

  describe('entregas repetidas', () => {
    it('repetir la entrega no duplica ni cambia al cliente (conserva un premium que ya se le dio)', async () => {
      const user = event();
      await deliver(user);
      await query('UPDATE sales.customers SET premium = true');

      await deliver(user);

      expect(await customers()).toEqual([
        { id: user.userId, email: 'ana@example.com', premium: true },
      ]);
    });

    it('una entrega que se deshace no deja al cliente', async () => {
      await expect(deliver(event(), true)).rejects.toThrow('se deshace');
      expect(await customers()).toEqual([]);
    });
  });

  describe('lo que no es un comprador o no es válido', () => {
    it('un administrador no es cliente: no se crea nada', async () => {
      await deliver(event({ role: 'ADMIN' }));
      expect(await customers()).toEqual([]);
    });

    it('el mismo id con otro correo es un error y no cambia al cliente', async () => {
      const first = event();
      await deliver(first);

      await expect(
        deliver({ ...first, email: 'otro@example.com' }),
      ).rejects.toThrow(/otro correo/);

      expect(await customers()).toEqual([
        { id: first.userId, email: 'ana@example.com', premium: false },
      ]);
    });

    it('un correo que ya tiene otro cliente es un error visible (no se omite en silencio) y no cambia nada', async () => {
      const existing = event();
      await deliver(existing);

      await expect(
        deliver(event({ email: 'ana@example.com' })),
      ).rejects.toThrow();

      expect(await customers()).toEqual([
        { id: existing.userId, email: 'ana@example.com', premium: false },
      ]);
    });

    it.each(['sin-arroba', '', 'a@b'])(
      'un correo inválido (%j) es un error',
      async (email) => {
        await expect(deliver(event({ email }))).rejects.toThrow();
        expect(await customers()).toEqual([]);
      },
    );

    it.each(['no-es-uuid', '', 'x'.repeat(40)])(
      'un id inválido (%j) es un error',
      async (userId) => {
        await expect(deliver(event({ userId }))).rejects.toThrow(/UUID/);
        expect(await customers()).toEqual([]);
      },
    );

    it('un rol desconocido es un error: no se adivina qué hacer', async () => {
      await expect(deliver(event({ role: 'SUPERUSER' }))).rejects.toThrow();
      expect(await customers()).toEqual([]);
    });

    it('un correo en conflicto deja la entrega reintentándose (no DONE)', async () => {
      await query(
        "INSERT INTO sales.customers (id, email, premium) VALUES ($1, 'ana@example.com', false)",
        [randomUUID()],
      );
      await register('ana@example.com');

      await relay.runOnce();

      const [outbox] = await outboxRows();
      const [delivery] = await deliveryRows(outbox.id);
      expect(delivery.status).not.toBe('DONE');
      expect(delivery.attempts).toBeGreaterThanOrEqual(1);
      expect(delivery.last_error).toBeTruthy();
    });
  });
});
