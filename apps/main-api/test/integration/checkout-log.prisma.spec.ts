import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { PrismaCheckoutLog } from '../../src/contexts/sales/infrastructure/persistence/prisma-checkout-log.adapter.js';
import { PrismaCustomerRepository } from '../../src/contexts/sales/infrastructure/persistence/prisma-customer.repository.js';
import {
  RECOVERY_BATCH,
  RECOVERY_LOCK_MINUTES,
} from '../../src/contexts/sales/domain/ports/checkout-log.port.js';
import { Customer } from '../../src/contexts/sales/domain/customer/customer.aggregate.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { insertCustomer } from '../support/builders.js';
import {
  checkoutLogContract,
  type CheckoutLogSubject,
} from '../support/checkout-log.contract.js';
import {
  holdRowLock,
  query,
  resetDatabase,
  useDatabaseTimeZone,
} from '../support/database.js';
import { createTestApp } from '../support/nest.js';

let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});
afterAll(async () => {
  await app.close();
});

// Ayudas para preparar y mirar el estado con SQL directo, sin pasar por el código bajo prueba
function subjectFor(service: PrismaService): CheckoutLogSubject {
  return {
    log: new PrismaCheckoutLog(service),
    complete: async (orderId, charged) => {
      await query(
        `UPDATE sales.checkouts SET status = 'COMPLETED', charged_amount = $2, currency = $3::sales."Currency"
         WHERE order_id = $1`,
        [orderId, charged.toFixed(), charged.currency],
      );
    },
    backdate: async (orderId, minutes) => {
      await query(
        'UPDATE sales.checkouts SET started_at = started_at - make_interval(mins => $2) WHERE order_id = $1',
        [orderId, minutes],
      );
    },
    expireLock: async (orderId) => {
      await query(
        "UPDATE sales.checkouts SET locked_until = now() - interval '1 second' WHERE order_id = $1",
        [orderId],
      );
    },
    statusOf: async (orderId) => {
      const [row] = await query<{
        status: 'PENDING' | 'COMPLETED' | 'ABORTED';
      }>(
        'SELECT status::text AS status FROM sales.checkouts WHERE order_id = $1',
        [orderId],
      );
      return row?.status;
    },
  };
}

// El mismo contrato que cumple el fake en memoria
checkoutLogContract('Prisma', async () => {
  await resetDatabase();
  return subjectFor(prisma);
});

describe('PrismaCheckoutLog: lo que solo se puede probar con PostgreSQL real', () => {
  beforeEach(resetDatabase);

  it('dos start simultáneos con la misma clave: solo uno entra (índice único)', async () => {
    const log = new PrismaCheckoutLog(prisma);
    const key = randomUUID();

    const results = await Promise.all([
      log.start(randomUUID(), key, 'h'),
      log.start(randomUUID(), key, 'h'),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const [{ n }] = await query<{ n: string }>(
      'SELECT count(*) AS n FROM sales.checkouts',
    );
    expect(Number(n)).toBe(1);
  });

  it('purgeFinished pasa de largo por un checkout que otra transacción tiene bloqueado, en vez de esperarla (SKIP LOCKED)', async () => {
    const log = new PrismaCheckoutLog(prisma);
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    for (const id of ids) {
      await log.start(id, randomUUID(), 'h');
      await log.abort(id);
    }
    await query(
      "UPDATE sales.checkouts SET started_at = now() - interval '40 days'",
    );
    const release = await holdRowLock(
      'SELECT 1 FROM sales.checkouts WHERE order_id = $1 FOR UPDATE',
      [ids[2]],
    );
    try {
      expect(await log.purgeFinished(30, 100)).toBe(2);
    } finally {
      await release();
    }
    expect(await log.purgeFinished(30, 100)).toBe(1);
  });

  it('guarda el requestId de la petición en la columna request_id', async () => {
    const log = new PrismaCheckoutLog(prisma);
    const orderId = randomUUID();

    await RequestContext.run('r-guardado', () =>
      log.start(orderId, randomUUID(), 'h'),
    );

    const [row] = await query<{ request_id: string }>(
      'SELECT request_id FROM sales.checkouts WHERE order_id = $1',
      [orderId],
    );
    expect(row.request_id).toBe('r-guardado');
  });

  it(`lo reclamado queda bloqueado exactamente ${RECOVERY_LOCK_MINUTES} minutos, medidos con el reloj de la base`, async () => {
    const log = new PrismaCheckoutLog(prisma);
    const orderId = randomUUID();
    await log.start(orderId, randomUUID(), 'h');
    await query(
      'UPDATE sales.checkouts SET started_at = started_at - make_interval(mins => 11) WHERE order_id = $1',
      [orderId],
    );

    await log.claimStale(10);

    const [row] = await query<{ secs: number }>(
      'SELECT extract(epoch FROM (locked_until - now()))::float AS secs FROM sales.checkouts WHERE order_id = $1',
      [orderId],
    );
    expect(row.secs).toBeGreaterThan(RECOVERY_LOCK_MINUTES * 60 - 5);
    expect(row.secs).toBeLessThanOrEqual(RECOVERY_LOCK_MINUTES * 60);
  });

  it('dos recuperaciones a la vez no toman el mismo checkout (SKIP LOCKED)', async () => {
    const log = new PrismaCheckoutLog(prisma);
    const subject = subjectFor(prisma);
    const orderIds: string[] = [];
    for (let i = 0; i < RECOVERY_BATCH + 3; i++) {
      const orderId = randomUUID();
      await log.start(orderId, randomUUID(), 'h');
      await subject.backdate(orderId, 11);
      orderIds.push(orderId);
    }

    const [first, second] = await Promise.all([
      log.claimStale(10),
      log.claimStale(10),
    ]);

    const firstIds = first.map((c) => c.orderId);
    const secondIds = second.map((c) => c.orderId);
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([]); // ninguno repetido
    expect(new Set([...firstIds, ...secondIds])).toEqual(new Set(orderIds)); // y entre las dos, todos
    expect(await log.claimStale(10)).toEqual([]);
  });

  it('una fila que otra transacción tiene bloqueada no frena la recuperación: se salta (SKIP LOCKED)', async () => {
    const log = new PrismaCheckoutLog(prisma);
    const subject = subjectFor(prisma);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const orderId = randomUUID();
      await log.start(orderId, randomUUID(), 'h');
      await subject.backdate(orderId, 11);
      ids.push(orderId);
    }
    // otra instancia está en plena recuperación de la primera: tiene su fila bloqueada
    const other = new Client({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await other.connect();
    try {
      await other.query('BEGIN');
      await other.query(
        'SELECT 1 FROM sales.checkouts WHERE order_id = $1 FOR UPDATE',
        [ids[0]],
      );

      const claimed = await Promise.race([
        log.claimStale(10),
        new Promise<'bloqueado'>((resolve) =>
          setTimeout(() => resolve('bloqueado'), 3_000),
        ),
      ]);

      expect(claimed).not.toBe('bloqueado'); // sin SKIP LOCKED esperaría a que la otra transacción termine
      expect(
        (claimed as { orderId: string }[]).map((c) => c.orderId).sort(),
      ).toEqual([ids[1], ids[2]].sort());
    } finally {
      await other.query('ROLLBACK');
      await other.end();
    }
  });

  it('recupera primero los más antiguos aunque el planificador no pueda usar el índice', async () => {
    // Con el índice (status, started_at) PostgreSQL devuelve lo más antiguo primero por casualidad del plan;
    // el ORDER BY lo convierte en una garantía. Sin índice, el orden sería el físico de la tabla
    const log = new PrismaCheckoutLog(prisma);
    const subject = subjectFor(prisma);
    await query('DROP INDEX sales.checkouts_status_started_at_idx');
    try {
      const byAge: string[] = [];
      for (let i = 0; i < RECOVERY_BATCH + 2; i++) {
        const orderId = randomUUID();
        await log.start(orderId, randomUUID(), 'h');
        await subject.backdate(orderId, 11 + i); // los primeros creados son los más nuevos
        byAge.unshift(orderId);
      }

      const claimed = await log.claimStale(10);

      expect(new Set(claimed.map((c) => c.orderId))).toEqual(
        new Set(byAge.slice(0, RECOVERY_BATCH)),
      );
    } finally {
      await query(
        'CREATE INDEX checkouts_status_started_at_idx ON sales.checkouts (status, started_at)',
      );
    }
  });

  it('un checkout COMPLETED sin moneda (dato inconsistente) falla con un mensaje claro, no con un monto inventado', async () => {
    const log = new PrismaCheckoutLog(prisma);
    const orderId = randomUUID();
    const key = randomUUID();
    await log.start(orderId, key, 'h');
    await query(
      "UPDATE sales.checkouts SET status = 'COMPLETED', charged_amount = 10, currency = NULL WHERE order_id = $1",
      [orderId],
    );

    await expect(log.findByKey(key)).rejects.toThrow(/moneda/i);
  });

  describe('con la base de datos en otra zona horaria', () => {
    // started_at lo escribe Prisma en UTC y claimStale compara con now(): las conexiones de la aplicación fuerzan UTC
    let restore: () => Promise<void>;
    let limaApp: INestApplication;

    beforeAll(async () => {
      restore = await useDatabaseTimeZone('America/Lima');
      limaApp = await createTestApp(); // sus conexiones nacen con la base ya en otra zona
    });
    afterAll(async () => {
      await limaApp.close();
      await restore();
    });
    beforeEach(async () => {
      await resetDatabase();
      await useDatabaseTimeZone('America/Lima');
    });

    it('un checkout de hace 11 minutos se recupera, y uno de hace 2 no', async () => {
      const lima = limaApp.get(PrismaService);
      const log = new PrismaCheckoutLog(lima);
      const subject = subjectFor(lima);
      const old = randomUUID();
      const fresh = randomUUID();
      await log.start(old, randomUUID(), 'h');
      await log.start(fresh, randomUUID(), 'h');
      await subject.backdate(old, 11);
      await subject.backdate(fresh, 2);

      expect((await log.claimStale(10)).map((c) => c.orderId)).toEqual([old]);
    });
  });
});

describe('PrismaCustomerRepository', () => {
  beforeEach(resetDatabase);

  it('devuelve un Customer con su correo y si es premium', async () => {
    const premium = await insertCustomer({
      email: 'luis@example.com',
      premium: true,
    });
    const normal = await insertCustomer({ premium: false });
    const repo = new PrismaCustomerRepository(prisma);

    const luis = await repo.findById(premium.id);
    const other = await repo.findById(normal.id);

    expect(luis).toBeInstanceOf(Customer);
    expect(luis).toMatchObject({ id: premium.id, isPremium: true });
    expect(luis?.email.value).toBe('luis@example.com');
    expect(other?.isPremium).toBe(false);
  });

  it('un cliente que no existe da null', async () => {
    expect(
      await new PrismaCustomerRepository(prisma).findById(randomUUID()),
    ).toBeNull();
  });

  it('no mezcla clientes: devuelve el que se pide', async () => {
    const a = await insertCustomer({ email: 'a@example.com' });
    await insertCustomer({ email: 'b@example.com' });

    expect(
      (await new PrismaCustomerRepository(prisma).findById(a.id))?.email.value,
    ).toBe('a@example.com');
  });
});
