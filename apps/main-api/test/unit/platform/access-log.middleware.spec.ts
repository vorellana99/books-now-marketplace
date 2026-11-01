import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { accessLog } from '../../../src/platform/observability/access-log.middleware.js';
import { RequestContext } from '../../../src/platform/observability/request-context.js';

interface Line {
  level: 'log' | 'warn' | 'error';
  message: string;
  requestId: string | undefined;
}

function setup(clock: () => number = () => 1000) {
  const lines: Line[] = [];
  const record = (level: Line['level']) => (message: unknown) => {
    lines.push({
      level,
      message: String(message),
      requestId: RequestContext.requestId(),
    });
  };
  const logger = {
    log: record('log'),
    warn: record('warn'),
    error: record('error'),
  } as unknown as Logger;
  const middleware = accessLog(logger, clock);
  return { lines, middleware };
}

function request(
  overrides: Record<string, unknown> = {},
  statusCode = 200,
  extra: Record<string, unknown> = {},
) {
  const res = Object.assign(new EventEmitter(), {
    statusCode,
    writableFinished: true,
    ...extra,
  });
  const req = {
    method: 'GET',
    path: '/books',
    originalUrl: '/books?q=clean',
    requestId: 'r-1',
    headers: { authorization: 'Bearer secreto', cookie: 'a=secreto' },
    body: { password: 'secreto' },
    ...overrides,
  };
  return { req, res };
}

const run = (
  middleware: ReturnType<typeof accessLog>,
  r: ReturnType<typeof request>,
  finish = true,
) => {
  const next = vi.fn();
  middleware(r.req as never, r.res as never, next);
  if (finish) r.res.emit('close');
  return next;
};

describe('accessLog', () => {
  it('llama a next y no escribe nada hasta que la respuesta termina', () => {
    const { lines, middleware } = setup();
    const r = request();

    const next = run(middleware, r, false);

    expect(next).toHaveBeenCalledTimes(1);
    expect(lines).toEqual([]);
    r.res.emit('close');
    expect(lines).toHaveLength(1);
  });

  it('escribe método, ruta, estado y duración, con el requestId de la petición', () => {
    let now = 1000;
    const { lines, middleware } = setup(() => now);
    const r = request({ method: 'POST', path: '/orders' }, 201);

    run(middleware, r, false);
    now = 1042;
    r.res.emit('close');

    expect(lines).toEqual([
      { level: 'log', message: 'POST /orders 201 42ms', requestId: 'r-1' },
    ]);
  });

  it('añade el usuario autenticado, que el guard pone en la petición antes de que termine', () => {
    const { lines, middleware } = setup();
    const r = request({ path: '/me/orders' });

    run(middleware, r, false);
    (r.req as Record<string, unknown>).user = {
      userId: '0196a000-0000-7000-8000-0000000000aa',
      role: 'BUYER',
    };
    r.res.emit('close');

    expect(lines[0].message).toBe(
      'GET /me/orders 200 0ms usuario=0196a000-0000-7000-8000-0000000000aa',
    );
  });

  it('no escribe la query, las cabeceras, las cookies ni el cuerpo', () => {
    const { lines, middleware } = setup();

    run(middleware, request({ path: '/auth/login', method: 'POST' }, 200));
    run(
      middleware,
      request({ path: '/books', originalUrl: '/books?token=secreto&q=x' }),
    );

    const text = JSON.stringify(lines);
    expect(text).not.toContain('secreto');
    expect(text).not.toContain('token=');
    expect(text).not.toContain('Bearer');
  });

  it.each([
    [200, 'log'],
    [201, 'log'],
    [302, 'log'],
    [400, 'warn'],
    [401, 'warn'],
    [404, 'warn'],
    [429, 'warn'],
    [499, 'warn'],
    [500, 'error'],
    [503, 'error'],
  ])('un %i se escribe con el nivel %s', (status, level) => {
    const { lines, middleware } = setup();
    run(middleware, request({}, status));
    expect(lines[0].level).toBe(level);
  });

  it('las consultas de salud no se escriben: las repite el balanceador cada pocos segundos', () => {
    const { lines, middleware } = setup();
    for (const path of ['/health/live', '/health/ready', '/health/outbox']) {
      run(middleware, request({ path }));
    }
    expect(lines).toEqual([]);
  });

  it('una ruta que solo empieza como /health sí se escribe', () => {
    const { lines, middleware } = setup();
    run(middleware, request({ path: '/healthy' }));
    run(middleware, request({ path: '/healthcheck/x' }));
    expect(lines).toHaveLength(2);
  });

  it('una ruta con caracteres de control o saltos de línea no puede falsificar otra línea del log', () => {
    const { lines, middleware } = setup();

    run(
      middleware,
      request({
        path: '/books/x\nGET /admin/orders 200 0ms\r\u0000\u001b[31m',
      }),
    );

    expect(lines).toHaveLength(1);
    for (let i = 0; i < lines[0].message.length; i++) {
      const code = lines[0].message.charCodeAt(i);
      expect(code >= 0x20 && code <= 0x7e).toBe(true);
    }
    expect(lines[0].message.split('\n')).toHaveLength(1);
  });

  it('una ruta muy larga se recorta', () => {
    const { lines, middleware } = setup();
    run(middleware, request({ path: `/${'a'.repeat(5000)}` }));
    expect(lines[0].message.length).toBeLessThan(300);
    expect(lines[0].message).toContain('…');
  });

  it('una petición cancelada (la conexión se cerró sin terminar la respuesta) se escribe como cancelada', () => {
    const { lines, middleware } = setup();

    run(middleware, request({}, 200, { writableFinished: false }));

    expect(lines).toHaveLength(1);
    expect(lines[0].level).toBe('warn');
    expect(lines[0].message).toMatch(/^GET \/books cancelada \d+ms$/);
    expect(lines[0].message).not.toContain(' 200 ');
  });

  it('escribe una sola línea por petición aunque llegue más de un evento de cierre', () => {
    const { lines, middleware } = setup();
    const r = request();

    run(middleware, r);
    r.res.emit('close');
    r.res.emit('finish');

    expect(lines).toHaveLength(1);
  });

  it('sin requestId escribe igual', () => {
    const { lines, middleware } = setup();
    run(middleware, request({ requestId: undefined }));
    expect(lines).toHaveLength(1);
    expect(lines[0].requestId).toBeUndefined();
  });

  it('usa solo la ruta, no la URL completa que pudo traer un host', () => {
    const { lines, middleware } = setup();
    run(
      middleware,
      request({ path: '/books', originalUrl: 'http://evil.example/books?x=1' }),
    );
    expect(lines[0].message).toBe('GET /books 200 0ms');
  });
});
