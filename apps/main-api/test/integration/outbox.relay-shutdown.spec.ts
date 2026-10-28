import { randomUUID } from 'node:crypto';
import { Logger, type INestApplication } from '@nestjs/common';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { deliveryRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import {
  ExternalProbe,
  ProbeEvent,
  appWithProbes,
  probe,
} from '../support/outbox-probes.js';

// Conexiones abiertas contra la base de pruebas, sin contar la de esta consulta
const openConnections = async (): Promise<number> =>
  Number(
    (
      await query<{ n: string }>(
        'SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()',
      )
    )[0].n,
  );

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

describe('OutboxRelay: cerrar la aplicación a mitad de una entrega (PostgreSQL real)', () => {
  beforeEach(async () => {
    await resetDatabase();
    probe.reset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('el cierre espera la vuelta en curso y la entrega queda DONE, con la base todavía conectada', async () => {
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const app: INestApplication = await appWithProbes(ExternalProbe);
    const relay = app.get(OutboxRelay);
    await app
      .get(PrismaService)
      .$transaction((tx) =>
        app
          .get(OutboxWriter)
          .append(tx, [new ProbeEvent('test.external.event', randomUUID())]),
      );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const reached = new Promise<void>((resolve) => (entered = resolve));
    probe.behavior = async () => {
      entered();
      await gate; // el consumidor está en pleno envío
    };

    const run = relay.tick();
    await reached;
    let closed = false;
    const closing = app.close().then(() => (closed = true));
    await sleep(300);
    expect(closed).toBe(false); // el cierre está esperando a la entrega

    release();
    await closing;
    await run;

    expect(closed).toBe(true);
    expect((await deliveryRows())[0]).toMatchObject({
      status: 'DONE',
      attempts: 1,
      locked_until: null,
    });
    expect(error).not.toHaveBeenCalled();
    // Prisma se reconecta solo si le piden algo después de desconectarse: si el relay terminara su entrega
    // después de la desconexión, quedaría una conexión abierta que impediría cerrar el proceso
    expect(await openConnections()).toBe(0);
  });

  it('un relay que no está en una vuelta no retrasa el cierre', async () => {
    const app = await appWithProbes(ExternalProbe);
    const started = Date.now();

    await app.close();

    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
