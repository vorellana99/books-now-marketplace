import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Module } from '@nestjs/common';
import request from 'supertest';
import { HealthModule } from '../../src/platform/health/health.module.js';
import { OutboxRelay } from '../../src/platform/outbox/outbox.relay.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { makeDeliveriesDue } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import { createTestApp } from '../support/nest.js';
import { ExternalProbe, ProbeEvent, probe } from '../support/outbox-probes.js';

describe('GET /health/outbox (PostgreSQL real)', () => {
  let app: INestApplication;
  let relay: OutboxRelay;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    @Module({ providers: [ExternalProbe] })
    class ProbesModule {}
    app = await createTestApp(HealthModule, ProbesModule);
    relay = app.get(OutboxRelay);
    writer = app.get(OutboxWriter);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    vi.useRealTimers();
    await app.close();
  });
  beforeEach(async () => {
    vi.useRealTimers();
    await resetDatabase();
    probe.reset();
  });

  const outbox = () => request(app.getHttpServer()).get('/health/outbox');
  const publish = () =>
    prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent('test.external.event', randomUUID())]),
    );

  it('antes de la primera vuelta del relay responde 503 con relayLastRunAt en null', async () => {
    // el relay de esta instancia todavía no terminó ninguna vuelta; se usa un relay recién creado
    const fresh = await createTestApp(HealthModule);
    try {
      const res = await request(fresh.getHttpServer())
        .get('/health/outbox')
        .expect(503);
      expect(res.body.status).toBe('error');
      expect(res.body.error.outbox).toMatchObject({
        status: 'down',
        relayLastRunAt: null,
      });
    } finally {
      await fresh.close();
    }
  });

  it('con el relay vivo responde 200 y trae la última vuelta y las cantidades', async () => {
    await relay.tick();

    const res = await outbox().expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.info.outbox).toMatchObject({
      status: 'up',
      failed: 0,
      due: 0,
    });
    expect(
      new Date(res.body.info.outbox.relayLastRunAt).getTime(),
    ).toBeLessThanOrEqual(Date.now());
  });

  it('una entrega FAILED antigua no lo pone en rojo, pero se cuenta en el detalle', async () => {
    await publish();
    await query(
      "UPDATE messaging.deliveries SET status = 'FAILED', last_error = 'viejo', attempts = 8",
    );
    await relay.tick();

    const res = await outbox().expect(200);

    expect(res.body.info.outbox).toMatchObject({ status: 'up', failed: 1 });
  });

  it('una entrega esperando su reintento no lo pone en rojo ni cuenta como vencida', async () => {
    await publish();
    await query(
      "UPDATE messaging.deliveries SET next_attempt_at = now() + interval '1 hour'",
    );
    await relay.tick();

    const res = await outbox().expect(200);

    expect(res.body.info.outbox).toMatchObject({ status: 'up', due: 0 });
  });

  it('las entregas vencidas se cuentan en `due` y no lo ponen en rojo', async () => {
    await publish();
    await publish();
    await relay.tick(); // las entrega y quedan DONE
    await publish();
    await publish();
    await publish();
    await makeDeliveriesDue();

    const res = await outbox().expect(200);

    expect(res.body.info.outbox).toMatchObject({ status: 'up', due: 3 });
  });

  it('un relay detenido (sin vueltas hace más de un minuto) responde 503', async () => {
    await relay.tick();
    await outbox().expect(200);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 61_000);
    const res = await outbox().expect(503);
    vi.useRealTimers();

    expect(res.body.error.outbox.status).toBe('down');
    expect(res.body.error.outbox.relayLastRunAt).not.toBeNull(); // se ve cuándo fue la última
  });

  it('/health/ready y /health/live no dependen del Outbox: siguen en 200 con el relay detenido', async () => {
    // este relay nunca terminó una vuelta
    const fresh = await createTestApp(HealthModule);
    try {
      await request(fresh.getHttpServer()).get('/health/outbox').expect(503);
      await request(fresh.getHttpServer()).get('/health/ready').expect(200);
      await request(fresh.getHttpServer()).get('/health/live').expect(200);
    } finally {
      await fresh.close();
    }
  });
});
