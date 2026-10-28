import { randomUUID } from 'node:crypto';
import { Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import { RequestAwareLogger } from '../../src/platform/observability/request-aware.logger.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';
import { OutboxModule } from '../../src/platform/outbox/outbox.module.js';
import { OutboxWriter } from '../../src/platform/outbox/outbox.writer.js';
import { PrismaService } from '../../src/platform/prisma/prisma.service.js';
import { deliveryRows } from '../support/builders.js';
import { query, resetDatabase } from '../support/database.js';
import {
  DbProbe,
  ExternalProbe,
  ProbeEvent,
  appWithProbes,
  probe,
} from '../support/outbox-probes.js';

// Espera hasta que se cumpla una condición, mirando cada 100 ms: el relay corre solo, cada segundo
async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('Outbox con el intervalo real, en la aplicación completa (e2e)', () => {
  let app: INestApplication;
  let writer: OutboxWriter;
  let prisma: PrismaService;

  beforeAll(async () => {
    @Module({ providers: [DbProbe, ExternalProbe] })
    class ProbesModule {}
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ProbesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    writer = app.get(OutboxWriter);
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDatabase();
    probe.reset();
  });

  const publish = (eventName: string, aggregateId: string = randomUUID()) =>
    prisma.$transaction((tx) =>
      writer.append(tx, [new ProbeEvent(eventName, aggregateId)]),
    );

  const doneCount = async () =>
    (await deliveryRows()).filter((d) => d.status === 'DONE').length;

  it('un evento guardado con append llega solo a su consumidor y la entrega queda DONE', async () => {
    await publish('test.external.event', 'pedido-7');

    await waitFor(doneCount, (n) => n === 1);

    expect(probe.calls).toHaveLength(1);
    expect(probe.calls[0].event).toMatchObject({ aggregateId: 'pedido-7' });
    expect((await deliveryRows())[0]).toMatchObject({
      status: 'DONE',
      attempts: 1,
    });
  });

  it('un consumidor db confirma su efecto junto con DONE', async () => {
    await publish('test.db.event');

    await waitFor(doneCount, (n) => n === 1);

    const effects = await query('SELECT 1 FROM inventory.reservations');
    expect(effects).toHaveLength(1);
  });

  it('un consumidor que falla se reintenta solo, con el retroceso real de 2 segundos', async () => {
    await publish('test.external.event');
    probe.behavior = async (call) => {
      if (call.ctx.attempt === 1) throw new Error('falla la primera vez');
    };

    await waitFor(doneCount, (n) => n === 1, 15_000);

    expect((await deliveryRows())[0]).toMatchObject({
      status: 'DONE',
      attempts: 2,
    });
    expect(probe.calls.map((c) => c.ctx.attempt)).toEqual([1, 2]);
  });

  describe('el correlationId en los logs del consumidor', () => {
    const captureLogs = () => {
      const lines: string[] = [];
      const logger = new RequestAwareLogger({ json: true });
      app.useLogger(logger);
      const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation((chunk) => {
          lines.push(String(chunk));
          return true;
        });
      return {
        lines,
        stop: () => write.mockRestore(),
      };
    };

    it('el log del consumidor lleva el requestId de la petición que generó el evento', async () => {
      const logs = captureLogs();
      try {
        await RequestContext.run('r-intervalo', () =>
          publish('test.external.event'),
        );
        await waitFor(doneCount, (n) => n === 1);
      } finally {
        logs.stop();
      }

      const line = logs.lines.find((l) => l.includes('recibió un evento'));
      expect(line).toBeDefined();
      // en modo JSON, el requestId va dentro de `message`
      expect(JSON.parse(line!)).toMatchObject({
        message: {
          requestId: 'r-intervalo',
          message: expect.stringContaining('recibió un evento'),
        },
        context: 'OutboxProbe',
      });
    });

    it('si el evento no nació en una petición, el log lleva event-<id> para seguir siendo rastreable', async () => {
      const logs = captureLogs();
      try {
        await publish('test.external.event');
        await waitFor(doneCount, (n) => n === 1);
      } finally {
        logs.stop();
      }

      const [{ event_id: eventId }] = await deliveryRows();
      const line = logs.lines.find((l) => l.includes('recibió un evento'));
      expect(JSON.parse(line!).message.requestId).toBe(`event-${eventId}`);
    });
  });

  it('GET /health/outbox pasa a 200 cuando el relay termina su primera vuelta', async () => {
    const res = await waitFor(
      () => request(app.getHttpServer()).get('/health/outbox'),
      (r) => r.status === 200,
      6_000,
    );

    expect(res.status).toBe(200);
    expect(res.body.info.outbox.status).toBe('up');
  });
});

describe('AppModule', () => {
  it('registra OutboxModule él mismo, sin depender de que otro módulo lo importe', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    expect(imports).toContain(OutboxModule);
  });

  it('mantiene ScheduleModule: es lo que pone a andar el intervalo del relay', () => {
    const imports = Reflect.getMetadata('imports', AppModule) as unknown[];
    const names = imports.map(
      (m) =>
        (m as { module?: { name?: string }; name?: string }).module?.name ??
        (m as { name?: string }).name,
    );
    expect(names).toContain('ScheduleModule');
  });
});

describe('OutboxModule por sí solo no programa el relay', () => {
  // ScheduleModule se queda en AppModule: así los tests de integración manejan el relay a mano
  it('sin ScheduleModule, una entrega pendiente sigue pendiente aunque pase más de un segundo', async () => {
    await resetDatabase();
    probe.reset();
    const app = await appWithProbes(ExternalProbe);
    try {
      await app
        .get(PrismaService)
        .$transaction((tx) =>
          app
            .get(OutboxWriter)
            .append(tx, [new ProbeEvent('test.external.event', randomUUID())]),
        );

      await new Promise((resolve) => setTimeout(resolve, 2_200)); // más de dos vueltas del intervalo

      expect(probe.calls).toEqual([]);
      expect((await deliveryRows())[0]).toMatchObject({
        status: 'PENDING',
        attempts: 0,
      });
    } finally {
      await app.close();
    }
  });

  it('createTestApp(OutboxModule) tampoco incluye ScheduleModule', () => {
    const modules = Reflect.getMetadata('imports', OutboxModule) as unknown[];
    expect(modules.map((m) => (m as { name?: string }).name)).not.toContain(
      'ScheduleModule',
    );
  });
});
