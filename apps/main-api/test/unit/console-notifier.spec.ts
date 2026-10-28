import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConsoleNotifier } from '../../src/contexts/sales/infrastructure/order/console-notifier.adapter.js';
import { Notifier } from '../../src/contexts/sales/domain/order/notifier.port.js';
import { RequestAwareLogger } from '../../src/platform/observability/request-aware.logger.js';
import { RequestContext } from '../../src/platform/observability/request-context.js';

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
});
