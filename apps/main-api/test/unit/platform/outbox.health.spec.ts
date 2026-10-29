import { HealthIndicatorService } from '@nestjs/terminus';
import { OutboxHealthIndicator } from '../../../src/platform/outbox/outbox.health.js';
import type { OutboxRelay } from '../../../src/platform/outbox/outbox.relay.js';
import type { PrismaService } from '../../../src/platform/prisma/prisma.service.js';

// Piezas simuladas: aquí solo importa cómo se arma la respuesta de salud
function indicatorWith(options: {
  alive: boolean;
  lastRun?: string | null;
  failed?: number;
  due?: number;
  countError?: Error;
}) {
  const relay = {
    isAlive: () => options.alive,
    lastRunAtIso: options.lastRun ?? null,
  } as unknown as OutboxRelay;
  const count = vi.fn(async (args: { where: { status: string } }) => {
    if (options.countError) throw options.countError;
    return args.where.status === 'FAILED'
      ? (options.failed ?? 0)
      : (options.due ?? 0);
  });
  const prisma = { delivery: { count } } as unknown as PrismaService;
  return {
    indicator: new OutboxHealthIndicator(
      relay,
      prisma,
      new HealthIndicatorService(),
    ),
    count,
  };
}

describe('OutboxHealthIndicator', () => {
  it('con el relay vivo está up y trae la última vuelta y las cantidades', async () => {
    const { indicator } = indicatorWith({
      alive: true,
      lastRun: '2026-10-27T12:00:00.000Z',
      failed: 2,
      due: 5,
    });

    expect(await indicator.check()).toEqual({
      outbox: {
        status: 'up',
        relayLastRunAt: '2026-10-27T12:00:00.000Z',
        failed: 2,
        due: 5,
      },
    });
  });

  it('con el relay detenido está down, y también trae los detalles', async () => {
    const { indicator } = indicatorWith({
      alive: false,
      lastRun: null,
      failed: 1,
      due: 3,
    });

    expect(await indicator.check()).toEqual({
      outbox: { status: 'down', relayLastRunAt: null, failed: 1, due: 3 },
    });
  });

  it('las entregas FAILED y las vencidas son solo informativas: no cambian el estado', async () => {
    const { indicator } = indicatorWith({
      alive: true,
      lastRun: '2026-10-27T12:00:00.000Z',
      failed: 9_999,
      due: 9_999,
    });
    expect((await indicator.check()).outbox.status).toBe('up');
  });

  it('cuenta las FAILED y las PENDING cuyo reintento ya tocaba', async () => {
    const { indicator, count } = indicatorWith({ alive: true });
    const before = Date.now();

    await indicator.check();

    const filters = count.mock.calls.map(
      ([args]) => args.where as Record<string, unknown>,
    );
    expect(filters).toContainEqual({ status: 'FAILED' });
    const due = filters.find((w) => w.status === 'PENDING') as {
      nextAttemptAt: { lte: Date };
    };
    expect(due.nextAttemptAt.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(due.nextAttemptAt.lte.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('usa la clave que se le pide', async () => {
    const { indicator } = indicatorWith({ alive: true });
    expect(Object.keys(await indicator.check('cola'))).toEqual(['cola']);
  });

  it('si la base no responde al contar, está down y lo dice, en vez de romper la respuesta', async () => {
    const { indicator } = indicatorWith({
      alive: true,
      countError: new Error('conexión rechazada'),
    });

    const result = await indicator.check();

    expect(result.outbox.status).toBe('down');
    expect(result.outbox).toMatchObject({
      error: expect.stringContaining('conexión rechazada'),
    });
  });
});
