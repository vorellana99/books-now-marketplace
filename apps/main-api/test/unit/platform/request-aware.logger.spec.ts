import { RequestAwareLogger } from '../../../src/platform/observability/request-aware.logger.js';
import { RequestContext } from '../../../src/platform/observability/request-context.js';

const LEVELS = ['log', 'warn', 'error', 'debug', 'verbose', 'fatal'] as const;

// Captura lo que el logger escribe. `error` y `fatal` van a stderr y el resto a stdout
function capture(fn: () => void): string[] {
  const lines: string[] = [];
  const write = (chunk: unknown) => {
    lines.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(write);
  vi.spyOn(process.stderr, 'write').mockImplementation(write);
  try {
    fn();
  } finally {
    vi.restoreAllMocks();
  }
  return lines;
}

const json = (lines: string[]) =>
  lines.map((l) => JSON.parse(l) as Record<string, unknown>);

describe('RequestAwareLogger: modo JSON', () => {
  const logger = new RequestAwareLogger({ json: true });

  it('el requestId va en el primer nivel y el mensaje sigue siendo texto', () => {
    const [entry] = json(
      capture(() =>
        RequestContext.run('r-7f3a', () => logger.log('hola', 'Demo')),
      ),
    );

    expect(entry).toMatchObject({
      level: 'log',
      requestId: 'r-7f3a',
      message: 'hola',
      context: 'Demo',
    });
  });

  it('sin petición en curso no hay requestId, y el mensaje también es texto', () => {
    const [entry] = json(capture(() => logger.log('sin contexto', 'Demo')));

    expect(entry).toMatchObject({ message: 'sin contexto', context: 'Demo' });
    expect(entry).not.toHaveProperty('requestId');
  });

  it('el campo `message` tiene siempre el mismo tipo, con o sin petición (sin conflicto en el indexador de logs)', () => {
    const entries = json(
      capture(() => {
        logger.log('uno');
        RequestContext.run('r-1', () => logger.log('dos'));
        RequestContext.run('r-2', () => logger.warn('tres'));
        logger.error('cuatro');
      }),
    );

    expect(entries.map((e) => typeof e.message)).toEqual([
      'string',
      'string',
      'string',
      'string',
    ]);
    expect(entries.every((e) => typeof e.message !== 'object')).toBe(true);
  });

  it.each(LEVELS)('el nivel %s lleva el requestId', (level) => {
    const [inside] = json(
      capture(() =>
        RequestContext.run('r-nivel', () => logger[level]('mensaje')),
      ),
    );
    const [outside] = json(capture(() => logger[level]('mensaje')));

    expect(inside).toMatchObject({
      level,
      requestId: 'r-nivel',
      message: 'mensaje',
    });
    expect(outside).not.toHaveProperty('requestId');
  });

  it('un error con traza conserva la traza y el contexto, y lleva el requestId', () => {
    const [entry] = json(
      capture(() =>
        RequestContext.run('r-err', () =>
          logger.error('algo falló', 'at x (y.ts:1)', 'MiServicio'),
        ),
      ),
    );

    expect(entry).toMatchObject({
      level: 'error',
      requestId: 'r-err',
      message: 'algo falló',
      context: 'MiServicio',
      stack: 'at x (y.ts:1)',
    });
  });

  it('un mensaje que ya es un objeto se conserva tal cual, y el requestId queda aparte', () => {
    const [entry] = json(
      capture(() =>
        RequestContext.run('r-obj', () => logger.log({ pedido: 7 })),
      ),
    );

    expect(entry.message).toEqual({ pedido: 7 });
    expect(entry.requestId).toBe('r-obj');
  });

  it('mantiene el resto de la forma: nivel, pid y marca de tiempo, en una sola línea', () => {
    const lines = capture(() =>
      RequestContext.run('r-1', () => logger.log('hola')),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].endsWith('\n')).toBe(true);
    expect(lines[0].trimEnd()).not.toContain('\n');
    expect(json(lines)[0]).toMatchObject({
      level: 'log',
      pid: process.pid,
      timestamp: expect.any(Number),
    });
  });

  it('el requestId no se filtra fuera de su contexto', () => {
    const entries = json(
      capture(() => {
        RequestContext.run('r-1', () => logger.log('dentro'));
        logger.log('fuera');
      }),
    );

    expect(entries[0].requestId).toBe('r-1');
    expect(entries[1]).not.toHaveProperty('requestId');
  });

  it('cada petición simultánea conserva el suyo', async () => {
    const entries = json(
      await (async () => {
        const lines: string[] = [];
        const write = (chunk: unknown) => {
          lines.push(String(chunk));
          return true;
        };
        vi.spyOn(process.stdout, 'write').mockImplementation(write);
        try {
          await Promise.all(
            ['a', 'b', 'c'].map((id) =>
              RequestContext.run(`r-${id}`, async () => {
                await new Promise((resolve) => setTimeout(resolve, 5));
                logger.log(`mensaje ${id}`);
              }),
            ),
          );
        } finally {
          vi.restoreAllMocks();
        }
        return lines;
      })(),
    );

    for (const entry of entries) {
      expect(`r-${String(entry.message).split(' ')[1]}`).toBe(entry.requestId);
    }
  });
});

describe('RequestAwareLogger: modo texto', () => {
  const logger = new RequestAwareLogger({ json: false, colors: false });

  it.each(LEVELS)('el nivel %s antepone el requestId al mensaje', (level) => {
    const [line] = capture(() =>
      RequestContext.run('r-7f3a', () => logger[level]('hola')),
    );
    expect(line).toContain('[r-7f3a] hola');
  });

  it('sin petición en curso no antepone nada', () => {
    const [line] = capture(() => logger.log('sin contexto'));

    expect(line).toContain('sin contexto');
    expect(line).not.toContain('[r-');
  });

  it('un mensaje que no es texto también muestra el requestId', () => {
    const [line] = capture(() =>
      RequestContext.run('r-obj', () => logger.log({ pedido: 7 })),
    );

    expect(line).toContain('r-obj');
    expect(line).toContain('pedido');
  });
});
