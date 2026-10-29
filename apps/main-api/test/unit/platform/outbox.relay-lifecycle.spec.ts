import { Logger } from '@nestjs/common';
import {
  LEASE_MS,
  OutboxRelay,
} from '../../../src/platform/outbox/outbox.relay.js';

// Un relay sin base de datos: aquí solo importa su ciclo de vida, y `runOnce` se sustituye por una función controlada
function relayWith(runOnce: () => Promise<number>) {
  const relay = new OutboxRelay({} as never, {} as never, {} as never);
  const spy = vi.spyOn(relay, 'runOnce').mockImplementation(runOnce);
  return { relay, runOnce: spy };
}

// Una promesa que el test resuelve a mano
function deferred<T = number>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('OutboxRelay: tick, isAlive y apagado', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('tick', () => {
    it('hace una vuelta y anota cuándo terminó', async () => {
      const { relay, runOnce } = relayWith(async () => 0);
      expect(relay.lastRunAtIso).toBeNull();

      await relay.tick();

      expect(runOnce).toHaveBeenCalledTimes(1);
      expect(relay.lastRunAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    });

    it('no solapa vueltas: si la anterior sigue, el tick no hace nada', async () => {
      const slow = deferred();
      const { relay, runOnce } = relayWith(() => slow.promise);

      const first = relay.tick();
      await relay.tick(); // llega mientras la primera sigue en curso
      await relay.tick();
      expect(runOnce).toHaveBeenCalledTimes(1);

      slow.resolve(0);
      await first;
      await relay.tick(); // ya terminó la anterior: ahora sí
      expect(runOnce).toHaveBeenCalledTimes(2);
    });

    it('un error no lo propaga ni mata el intervalo: se registra y la siguiente vuelta corre', async () => {
      let calls = 0;
      const { relay, runOnce } = relayWith(async () => {
        calls++;
        if (calls === 1) throw new Error('la base no responde');
        return 0;
      });

      await expect(relay.tick()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Vuelta del relay fallida: Error: la base no responde',
        ),
      );
      expect(relay.lastRunAtIso).toBeNull(); // una vuelta fallida no cuenta como "viva"

      await relay.tick();
      expect(runOnce).toHaveBeenCalledTimes(2);
      expect(relay.lastRunAtIso).not.toBeNull();
    });
  });

  describe('isAlive', () => {
    const NOW = new Date('2026-10-27T12:00:00.000Z').getTime();

    it('un relay que nunca terminó una vuelta no está vivo', () => {
      const { relay } = relayWith(async () => 0);
      expect(relay.isAlive(NOW)).toBe(false);
    });

    it.each([
      ['hace 1 segundo', 1_000, true],
      ['hace 59 segundos', 59_000, true],
      ['hace exactamente 1 minuto', 60_000, false],
      ['hace 5 minutos', 300_000, false],
    ])('terminó una vuelta %s', async (_cuando, ago, alive) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW - ago);
      const { relay } = relayWith(async () => 0);
      await relay.tick();

      expect(relay.isAlive(NOW)).toBe(alive);
    });

    it.each([
      ['empezó hace 5 segundos', 5_000, true],
      [
        'empezó hace 100 segundos (una vuelta legítima de un lote entero)',
        100_000,
        true,
      ],
      ['empezó hace 119 segundos', 119_000, true],
      ['lleva más que el bloqueo (2 minutos): está colgada', LEASE_MS, false],
      ['lleva 5 minutos', 300_000, false],
    ])('una vuelta en curso que %s', async (_caso, ago, alive) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW - ago);
      const never = deferred();
      const { relay } = relayWith(() => never.promise);
      void relay.tick(); // queda en curso

      expect(relay.isAlive(NOW)).toBe(alive);
      never.resolve(0);
    });

    it('una vuelta en curso larga cuenta como viva aunque la última terminada sea antigua', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW - 600_000);
      const { relay, runOnce } = relayWith(async () => 0);
      await relay.tick(); // terminó hace 10 minutos
      expect(relay.isAlive(NOW)).toBe(false);

      vi.setSystemTime(NOW - 30_000);
      const slow = deferred();
      runOnce.mockImplementation(() => slow.promise);
      void relay.tick(); // empezó hace 30 s y sigue

      expect(relay.isAlive(NOW)).toBe(true);
      slow.resolve(0);
    });

    it('usa la hora actual si no se le pasa ninguna', async () => {
      const { relay } = relayWith(async () => 0);
      await relay.tick();
      expect(relay.isAlive()).toBe(true);
    });
  });

  describe('apagado ordenado', () => {
    it('después de pedir el apagado, el tick no empieza vueltas nuevas', async () => {
      const { relay, runOnce } = relayWith(async () => 0);

      await relay.stop();
      await relay.tick();

      expect(runOnce).not.toHaveBeenCalled();
    });

    it('sin vuelta en curso, el apagado es inmediato', async () => {
      const { relay } = relayWith(async () => 0);
      await expect(relay.stop()).resolves.toBeUndefined();
    });

    it('espera a que termine la vuelta en curso', async () => {
      const slow = deferred();
      const { relay } = relayWith(() => slow.promise);
      const run = relay.tick();

      let stopped = false;
      const stopping = relay.stop(5_000).then(() => (stopped = true));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(stopped).toBe(false); // sigue esperando

      slow.resolve(3);
      await stopping;
      await run;
      expect(stopped).toBe(true);
      expect(relay.lastRunAtIso).not.toBeNull(); // la vuelta llegó a terminar
      expect(warn).not.toHaveBeenCalled();
    });

    it('si la vuelta no termina a tiempo, deja de esperar y lo avisa', async () => {
      const never = deferred();
      const { relay } = relayWith(() => never.promise);
      void relay.tick();

      const started = Date.now();
      await relay.stop(80);

      expect(Date.now() - started).toBeLessThan(1_000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('no terminó'));
      never.resolve(0);
    });

    it('si la vuelta en curso falla mientras se espera, el apagado igual termina', async () => {
      const failing = deferred();
      const { relay } = relayWith(() =>
        failing.promise.then(() => Promise.reject(new Error('boom'))),
      );
      void relay.tick();

      const stopping = relay.stop(5_000);
      failing.resolve(0);

      await expect(stopping).resolves.toBeUndefined();
    });

    it('se puede pedir más de una vez', async () => {
      const { relay } = relayWith(async () => 0);
      await relay.stop();
      await expect(relay.stop()).resolves.toBeUndefined();
    });
  });

  describe('programación', () => {
    it('tick está programado con @Interval cada segundo', () => {
      // @Interval deja su metadato en la propia función del método
      const tick = Object.getOwnPropertyDescriptor(
        OutboxRelay.prototype,
        'tick',
      )?.value as object;
      expect(
        Reflect.getMetadata('SCHEDULE_INTERVAL_OPTIONS', tick),
      ).toMatchObject({ timeout: 1000 });
      expect(Reflect.getMetadata('SCHEDULER_TYPE', tick)).toBeDefined();
    });
  });
});
