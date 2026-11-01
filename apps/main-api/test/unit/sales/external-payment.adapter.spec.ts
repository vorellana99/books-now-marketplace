import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { PaymentGateway } from '../../../src/contexts/sales/domain/ports/payment-gateway.port.js';
import { Money } from '../../../src/contexts/sales/domain/shared/money.vo.js';
import {
  ExternalPaymentAdapter,
  PAYMENT_TIMEOUT_MS,
} from '../../../src/contexts/sales/infrastructure/adapters/external-payment.adapter.js';

const ORDER = '0196a000-0000-7000-8000-000000000001';
const TOKEN = 'tok_secreto_123';

interface Seen {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  body: unknown;
}

describe('ExternalPaymentAdapter (contra un servidor HTTP local)', () => {
  let server: Server;
  let baseUrl: string;
  let seen: Seen[];
  // Lo que responde el servidor a la siguiente petición
  let respond: (req: IncomingMessage, res: ServerResponse) => void;

  const json =
    (status: number, body: unknown) => (_: unknown, res: ServerResponse) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };

  beforeEach(async () => {
    seen = [];
    respond = json(200, { approved: true });
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        seen.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: raw ? JSON.parse(raw) : undefined,
        });
        respond(req, res);
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    vi.restoreAllMocks();
  });

  const adapter = (timeoutMs?: number, url = baseUrl) =>
    new ExternalPaymentAdapter(url, timeoutMs);
  const charge = (a = adapter()) => a.charge(Money.of('90.00'), TOKEN, ORDER);
  const failure = async (promise: Promise<unknown>) =>
    (await promise.then(
      () => undefined,
      (e: unknown) => e,
    )) as Error | undefined;

  it('es un PaymentGateway y el tiempo por defecto es de 10 segundos', () => {
    expect(adapter()).toBeInstanceOf(PaymentGateway);
    expect(PAYMENT_TIMEOUT_MS).toBe(10_000);
  });

  describe('charge', () => {
    it('hace POST /charges con la referencia, el monto en texto, la moneda y el token', async () => {
      await charge();

      expect(seen).toHaveLength(1);
      expect(seen[0].method).toBe('POST');
      expect(seen[0].url).toBe('/charges');
      expect(seen[0].headers['content-type']).toContain('application/json');
      expect(seen[0].headers['idempotency-key']).toBe(ORDER);
      expect(seen[0].body).toEqual({
        reference: ORDER,
        amount: '90.00',
        currency: 'PEN',
        token: TOKEN,
      });
    });

    it('envía el monto en dólares con su moneda y redondeado a 2 decimales', async () => {
      await adapter().charge(Money.of('23.505', 'USD'), TOKEN, ORDER);
      expect(seen[0].body).toMatchObject({ amount: '23.51', currency: 'USD' });
    });

    it('aprobado', async () => {
      respond = json(200, { approved: true });
      expect(await charge()).toEqual({ approved: true });
    });

    it('rechazado, con el motivo del proveedor', async () => {
      respond = json(200, { approved: false, reason: 'fondos insuficientes' });
      expect(await charge()).toEqual({
        approved: false,
        reason: 'fondos insuficientes',
      });
    });

    it('rechazado sin motivo', async () => {
      respond = json(200, { approved: false });
      expect(await charge()).toEqual({ approved: false, reason: undefined });
    });

    it('ignora un motivo que no es texto y recorta uno demasiado largo', async () => {
      respond = json(200, { approved: false, reason: { sql: 'x' } });
      expect((await charge()).reason).toBeUndefined();

      respond = json(200, { approved: false, reason: 'x'.repeat(500) });
      expect((await charge()).reason).toHaveLength(200);
    });

    it('usa el tiempo indicado, o 10 s si no se indica', async () => {
      const spy = vi.spyOn(AbortSignal, 'timeout');
      await charge(adapter());
      await charge(adapter(1234));
      expect(spy.mock.calls.map((c) => c[0])).toEqual([10_000, 1234]);
    });

    it('si el proveedor no responde a tiempo, falla con un error de tiempo agotado', async () => {
      respond = () => undefined; // nunca responde

      const error = await failure(charge(adapter(60)));

      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toMatch(/tiempo/i);
    });

    it('un 500 es un error, no un rechazo', async () => {
      respond = json(500, { error: 'boom' });
      const error = await failure(charge());
      expect(error?.message).toContain('500');
    });

    it('un 400 también es un error', async () => {
      respond = json(400, { error: 'mal pedido' });
      expect((await failure(charge()))?.message).toContain('400');
    });

    it('un error de red (nadie escucha) es un error', async () => {
      const closed = createServer();
      await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
      await new Promise((r) => closed.close(r));

      expect(await failure(charge(adapter(2000, url)))).toBeInstanceOf(Error);
    });

    it.each([
      ['no es JSON', (_: unknown, res: ServerResponse) => res.end('<html>')],
      ['no trae approved', json(200, { ok: true })],
      ['approved no es booleano', json(200, { approved: 'true' })],
      ['es null', json(200, null)],
      ['es una lista', json(200, [])],
    ])('una respuesta que %s es un error', async (_name, handler) => {
      respond = handler;
      const error = await failure(charge());
      expect(error).toBeInstanceOf(Error);
      expect(error?.message).toMatch(/respuesta/i);
    });

    it('no sigue redirecciones', async () => {
      respond = (_req, res) => {
        res.writeHead(302, { location: `${baseUrl}/otro` });
        res.end();
      };
      expect(await failure(charge())).toBeInstanceOf(Error);
      expect(seen).toHaveLength(1);
    });

    it('respeta un prefijo en la URL base aunque no termine en barra', async () => {
      await charge(adapter(undefined, `${baseUrl}/api/v1`));
      expect(seen[0].url).toBe('/api/v1/charges');
    });

    it('respeta una barra final y un prefijo en la URL base', async () => {
      await charge(adapter(undefined, `${baseUrl}/api/v1/`));
      expect(seen[0].url).toBe('/api/v1/charges');
    });

    it.each([
      ['500', json(500, {})],
      ['respuesta inválida', json(200, { approved: 1 })],
      ['rechazo con motivo', json(200, { approved: false, reason: 'no' })],
    ])(
      'el token de la tarjeta nunca aparece en el error (%s)',
      async (_n, h) => {
        respond = h;
        const error = await failure(charge());
        if (error) {
          expect(error.message).not.toContain(TOKEN);
          expect(String(error.stack)).not.toContain(TOKEN);
          expect(String((error as { cause?: unknown }).cause)).not.toContain(
            TOKEN,
          );
        }
      },
    );

    it('el token tampoco aparece en el error de tiempo agotado ni en el de red', async () => {
      respond = () => undefined;
      const timeout = await failure(charge(adapter(50)));
      expect(JSON.stringify([timeout?.message, timeout?.stack])).not.toContain(
        TOKEN,
      );
    });

    it('el token tampoco aparece en el error de red', async () => {
      const closed = createServer();
      await new Promise<void>((r) => closed.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${(closed.address() as AddressInfo).port}`;
      await new Promise((r) => closed.close(r));

      const error = await failure(charge(adapter(2000, url)));

      expect(error).toBeInstanceOf(Error);
      expect(
        JSON.stringify([
          error?.message,
          error?.stack,
          String((error as { cause?: unknown }).cause),
        ]),
      ).not.toContain(TOKEN);
    });
  });

  describe('refund', () => {
    it('hace POST /refunds solo con la referencia, sin ningún dato de tarjeta', async () => {
      await adapter().refund(ORDER);

      expect(seen[0].method).toBe('POST');
      expect(seen[0].url).toBe('/refunds');
      expect(seen[0].headers['idempotency-key']).toBe(ORDER);
      expect(seen[0].body).toEqual({ reference: ORDER });
    });

    it.each([200, 204, 404])('un %i se toma como hecho', async (status) => {
      respond = (_req, res) => {
        res.writeHead(status);
        res.end();
      };
      await expect(adapter().refund(ORDER)).resolves.toBeUndefined();
    });

    it('un 500 es un error: el reembolso queda pendiente', async () => {
      respond = json(500, {});
      expect((await failure(adapter().refund(ORDER)))?.message).toContain(
        '500',
      );
    });

    it('un 400 es un error', async () => {
      respond = json(400, {});
      expect(await failure(adapter().refund(ORDER))).toBeInstanceOf(Error);
    });

    it('sin respuesta a tiempo es un error de tiempo agotado', async () => {
      respond = () => undefined;
      expect((await failure(adapter(60).refund(ORDER)))?.message).toMatch(
        /tiempo/i,
      );
    });

    it('no sigue redirecciones', async () => {
      respond = (_req, res) => {
        res.writeHead(307, { location: `${baseUrl}/otro` });
        res.end();
      };
      expect(await failure(adapter().refund(ORDER))).toBeInstanceOf(Error);
      expect(seen).toHaveLength(1);
    });

    it('usa el mismo tiempo máximo que el cobro', async () => {
      const spy = vi.spyOn(AbortSignal, 'timeout');
      await adapter(777).refund(ORDER);
      expect(spy.mock.calls.map((c) => c[0])).toEqual([777]);
    });
  });
});
