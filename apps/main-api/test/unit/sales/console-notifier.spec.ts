import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConsoleNotifier } from '../../../src/contexts/sales/infrastructure/adapters/console-notifier.adapter.js';
import { Notifier } from '../../../src/contexts/sales/domain/order/notifier.port.js';
import { RequestAwareLogger } from '../../../src/platform/observability/request-aware.logger.js';
import { RequestContext } from '../../../src/platform/observability/request-context.js';

// Escribe con el logger de la aplicación (el mismo que se instala al arrancar) y captura lo que sale
async function capture(
  logger: RequestAwareLogger,
  fn: () => Promise<void>,
): Promise<string[]> {
  const lines: string[] = [];
  const write = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(write);
  vi.spyOn(process.stderr, 'write').mockImplementation(write);
  Logger.overrideLogger(logger);
  try {
    await fn();
  } finally {
    Logger.overrideLogger(new ConsoleLogger());
    vi.restoreAllMocks();
  }
  return lines;
}

const json = (lines: string[]) =>
  lines.map((l) => JSON.parse(l) as Record<string, unknown>);

describe('ConsoleNotifier', () => {
  const notifier = new ConsoleNotifier();

  it('es un Notifier', () => {
    expect(notifier).toBeInstanceOf(Notifier);
  });

  it('escribe en el log el destinatario, el mensaje y la clave de idempotencia', async () => {
    const [entry] = json(
      await capture(new RequestAwareLogger({ json: true }), () =>
        notifier.send('ana@example.com', 'Tu pedido fue recibido', {
          idempotencyKey: 'evt-1',
        }),
      ),
    );

    expect(entry).toMatchObject({
      level: 'log',
      context: 'ConsoleNotifier',
    });
    expect(entry.message).toContain('ana@example.com');
    expect(entry.message).toContain('Tu pedido fue recibido');
    expect(entry.message).toContain('evt-1');
  });

  it('sin clave de idempotencia no menciona ninguna', async () => {
    const [entry] = json(
      await capture(new RequestAwareLogger({ json: true }), () =>
        notifier.send('ana@example.com', 'Hola'),
      ),
    );

    expect(entry.message).toContain('Hola');
    expect(entry.message).not.toContain('undefined');
    expect(entry.message).not.toMatch(/clave/i);
  });

  it('el log lleva el requestId de la petición que originó el correo', async () => {
    const [entry] = json(
      await capture(new RequestAwareLogger({ json: true }), () =>
        RequestContext.run('r-compra-9', () =>
          notifier.send('ana@example.com', 'Hola'),
        ),
      ),
    );

    expect(entry.requestId).toBe('r-compra-9');
  });

  it('en texto, el requestId va como prefijo [id]', async () => {
    const lines = await capture(new RequestAwareLogger(), () =>
      RequestContext.run('r-compra-9', () =>
        notifier.send('ana@example.com', 'Hola'),
      ),
    );

    expect(lines.join('')).toContain('[r-compra-9]');
  });

  it('devuelve una promesa que se cumple sin valor', async () => {
    const logger = new RequestAwareLogger({ json: true });
    let result: unknown = 'sin ejecutar';
    await capture(logger, async () => {
      result = await notifier.send('ana@example.com', 'Hola');
    });
    expect(result).toBeUndefined();
  });

  describe('con demora, como un proveedor de email real', () => {
    const DELAY = 3000;
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    // Captura el log mientras el reloj es falso: el test decide cuándo pasa el tiempo
    async function withLogs(
      run: (lines: string[]) => Promise<void>,
    ): Promise<void> {
      const lines: string[] = [];
      vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
        lines.push(String(chunk));
        return true;
      });
      Logger.overrideLogger(new RequestAwareLogger({ json: true }));
      try {
        await run(lines);
      } finally {
        Logger.overrideLogger(new ConsoleLogger());
        vi.restoreAllMocks();
      }
    }

    it('expone la demora configurada, y por defecto no hay ninguna', () => {
      expect(new ConsoleNotifier(DELAY).delayMs).toBe(DELAY);
      expect(new ConsoleNotifier().delayMs).toBe(0);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      'rechaza una demora de %s',
      (value) => {
        expect(() => new ConsoleNotifier(value)).toThrow(/demora/i);
      },
    );

    it('el correo tarda lo configurado: antes no se envía y después aparece en el log', async () => {
      await withLogs(async (lines) => {
        const notifier = new ConsoleNotifier(DELAY);
        let done = false;
        void notifier.send('ana@example.com', 'Hola').then(() => (done = true));

        await vi.advanceTimersByTimeAsync(DELAY - 1);
        expect(done).toBe(false);
        expect(lines).toEqual([]);

        await vi.advanceTimersByTimeAsync(1);
        expect(done).toBe(true);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('ana@example.com');
      });
    });

    it('el log, escrito tras la demora, conserva el requestId y la clave de idempotencia', async () => {
      await withLogs(async (lines) => {
        const notifier = new ConsoleNotifier(DELAY);
        void RequestContext.run('r-compra-9', () =>
          notifier.send('ana@example.com', 'Hola', { idempotencyKey: 'evt-1' }),
        );

        await vi.advanceTimersByTimeAsync(DELAY);

        const entry = JSON.parse(lines[0]) as Record<string, string>;
        expect(entry.requestId).toBe('r-compra-9');
        expect(entry.message).toContain('evt-1');
      });
    });

    it('con demora 0 no espera ningún temporizador', async () => {
      await withLogs(async (lines) => {
        // sin avanzar el reloj: si esperara un temporizador, nunca terminaría
        await new ConsoleNotifier(0).send('ana@example.com', 'Hola');
        expect(lines).toHaveLength(1);
      });
    });

    it('dos correos a la vez se envían cada uno tras su propia demora', async () => {
      await withLogs(async (lines) => {
        const notifier = new ConsoleNotifier(DELAY);
        void notifier.send('a@example.com', 'uno');
        await vi.advanceTimersByTimeAsync(1000);
        void notifier.send('b@example.com', 'dos');

        await vi.advanceTimersByTimeAsync(DELAY - 1000);
        expect(lines).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(lines).toHaveLength(2);
      });
    });
  });
});
