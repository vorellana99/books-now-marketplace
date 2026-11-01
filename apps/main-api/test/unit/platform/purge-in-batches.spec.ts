import { Logger } from '@nestjs/common';
import {
  PURGE_BATCH,
  PURGE_MAX_BATCHES,
  purgeInBatches,
  runPurge,
} from '../../../src/platform/retention/purge-in-batches.js';

describe('purgeInBatches', () => {
  it('repite hasta que un lote sale incompleto y suma lo borrado', async () => {
    const results = [1000, 1000, 300];
    const batch = vi.fn(() => Promise.resolve(results.shift() ?? 0));

    const total = await purgeInBatches(batch, { batch: 1000, maxBatches: 50 });

    expect(total).toBe(2300);
    expect(batch).toHaveBeenCalledTimes(3);
  });

  it('pide a cada lote el tamaño configurado', async () => {
    const batch = vi.fn((limit: number) => Promise.resolve(limit - 1));

    await purgeInBatches(batch, { batch: 25, maxBatches: 5 });

    expect(batch).toHaveBeenCalledWith(25);
  });

  it('si el primer lote no borra nada, termina con 0 tras una sola llamada', async () => {
    const batch = vi.fn(() => Promise.resolve(0));

    expect(await purgeInBatches(batch)).toBe(0);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('un lote que sale justo lleno obliga a mirar otro (puede quedar más)', async () => {
    const results = [10, 0];
    const batch = vi.fn(() => Promise.resolve(results.shift() ?? 0));

    expect(await purgeInBatches(batch, { batch: 10, maxBatches: 50 })).toBe(10);
    expect(batch).toHaveBeenCalledTimes(2);
  });

  it('un lote con uno menos del máximo ya es el último: no pide otro (9.15)', async () => {
    const batch = vi.fn(() => Promise.resolve(9));

    expect(await purgeInBatches(batch, { batch: 10, maxBatches: 50 })).toBe(9);
    expect(batch).toHaveBeenCalledTimes(1);
  });

  it('se detiene en el máximo de lotes aunque siga habiendo más', async () => {
    const batch = vi.fn((limit: number) => Promise.resolve(limit));

    const total = await purgeInBatches(batch, { batch: 10, maxBatches: 4 });

    expect(batch).toHaveBeenCalledTimes(4);
    expect(total).toBe(40);
  });

  it('un error del lote sale hacia quien llama', async () => {
    await expect(
      purgeInBatches(() => Promise.reject(new Error('base caída'))),
    ).rejects.toThrow('base caída');
  });

  it('por defecto: lotes de 1000 y como mucho 100 por vuelta', () => {
    expect(PURGE_BATCH).toBe(1000);
    expect(PURGE_MAX_BATCHES).toBe(100);
  });
});

describe('runPurge', () => {
  const logger = new Logger('test');
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(logger, 'log').mockImplementation(() => undefined);
    error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('devuelve lo borrado y lo anota en el log con el nombre de la tabla', async () => {
    const results = [3, 0];

    const total = await runPurge(logger, 'checkouts', 30, () =>
      Promise.resolve(results.shift() ?? 0),
    );

    expect(total).toBe(3);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('checkouts');
    expect(line).toContain('3');
    expect(line).toContain('30');
  });

  it('con varios lotes suma todos (9.15): lo borrado en total, no solo en el último', async () => {
    const results = [PURGE_BATCH, PURGE_BATCH, 7];

    const total = await runPurge(logger, 'outbox', 30, () =>
      Promise.resolve(results.shift() ?? 0),
    );

    expect(total).toBe(PURGE_BATCH * 2 + 7);
    expect(String(log.mock.calls[0]?.[0])).toContain(
      String(PURGE_BATCH * 2 + 7),
    );
  });

  it('si no había nada que borrar, no escribe en el log', async () => {
    expect(
      await runPurge(logger, 'checkouts', 30, () => Promise.resolve(0)),
    ).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it('un error no sale hacia el cron: se registra y devuelve lo borrado hasta entonces', async () => {
    const results = [PURGE_BATCH];
    const total = await runPurge(logger, 'outbox', 30, () =>
      results.length > 0
        ? Promise.resolve(results.shift() as number)
        : Promise.reject(new Error('base caída')),
    );

    expect(total).toBe(PURGE_BATCH);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain('outbox');
    expect(String(error.mock.calls[0]?.[0])).toContain('base caída');
  });
});
