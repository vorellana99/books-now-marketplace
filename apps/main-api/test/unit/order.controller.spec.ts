import {
  Logger,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { APP_GUARD } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GetOrderQuery } from '../../src/contexts/sales/application/order/get-order.query.js';
import { QuoteOrderQuery } from '../../src/contexts/sales/application/order/quote-order.query.js';
import { PlaceOrderCommand } from '../../src/contexts/sales/application/order/place-order.command.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { OrderController } from '../../src/contexts/sales/infrastructure/order/order.controller.js';
import { OutOfStockError } from '../../src/contracts/inventory/stock.errors.js';
import type { AuthenticatedUser } from '../../src/platform/auth/authenticated-user.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';

const KEY = '0196a000-0000-7000-8000-0000000000aa';
const CUSTOMER = '0196a000-0000-7000-8000-0000000000bb';
const ORDER = '0196a000-0000-7000-8000-0000000000cc';
const ADMIN = '0196a000-0000-7000-8000-0000000000dd';
const TOKEN = 'tok_secreto_123';

const ADDRESS = {
  recipient: 'Ana Pérez',
  phone: '+51 999 888 777',
  line1: 'Av. Larco 123, Dpto 401',
  district: 'Miraflores',
  province: 'Lima',
  department: 'Lima',
  reference: 'Frente al parque Kennedy',
};

const body = (overrides: Record<string, unknown> = {}) => ({
  cardToken: TOKEN,
  items: [{ isbn: '9780132350884', quantity: 2 }],
  shippingAddress: ADDRESS,
  ...overrides,
});

// Quien tiene la sesión en cada test. Hace de AuthGuard (que se prueba aparte): el guard real pone aquí `req.user`
let sessionUser: AuthenticatedUser | undefined;
class FakeSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user =
      sessionUser;
    return true;
  }
}

describe('OrderController (capa HTTP, con los buses simulados)', () => {
  let app: INestApplication;
  const commandBus = { execute: vi.fn() };
  const queryBus = { execute: vi.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: CommandBus, useValue: commandBus },
        { provide: QueryBus, useValue: queryBus },
        { provide: APP_GUARD, useClass: FakeSessionGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    sessionUser = { userId: CUSTOMER, role: 'BUYER' };
    commandBus.execute.mockReset();
    queryBus.execute.mockReset();
    commandBus.execute.mockResolvedValue({
      orderId: ORDER,
      charged: Money.of('90.00'),
    });
  });

  const place = (payload: unknown = body(), key: string | null = KEY) => {
    const req = request(app.getHttpServer()).post('/orders');
    if (key !== null) req.set('Idempotency-Key', key);
    return req.send(payload as object);
  };

  describe('POST /orders', () => {
    it('el cliente del comando es el de la sesión, sea quien sea', async () => {
      sessionUser = { userId: ADMIN, role: 'BUYER' };
      await place().expect(201);
      expect(
        (commandBus.execute.mock.calls[0][0] as PlaceOrderCommand).customerId,
      ).toBe(ADMIN);
    });

    it('sin usuario en la petición (ruta mal configurada) da 401 y no compra', async () => {
      sessionUser = undefined;
      const res = await place().expect(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
      expect(commandBus.execute).not.toHaveBeenCalled();
    });

    it('201 con el orderId y el monto cobrado como { amount, currency }', async () => {
      const res = await place().expect(201);
      expect(res.body).toEqual({
        orderId: ORDER,
        charged: { amount: '90.00', currency: 'PEN' },
      });
    });

    it('un cobro en dólares se responde en dólares', async () => {
      commandBus.execute.mockResolvedValue({
        orderId: ORDER,
        charged: Money.of('23.00', 'USD'),
      });
      const res = await place().expect(201);
      expect(res.body.charged).toEqual({ amount: '23.00', currency: 'USD' });
    });

    it('envía el comando con la clave del header, el cliente, las líneas y el token', async () => {
      await place().expect(201);

      expect(commandBus.execute).toHaveBeenCalledTimes(1);
      const command = commandBus.execute.mock.calls[0][0] as PlaceOrderCommand;
      expect(command).toBeInstanceOf(PlaceOrderCommand);
      expect(command).toMatchObject({
        idempotencyKey: KEY,
        customerId: CUSTOMER,
        cardToken: TOKEN,
      });
      expect(command.shippingAddress).toStrictEqual(ADDRESS); // objeto plano, no el DTO
      // objetos planos, no instancias del DTO
      expect(command.items).toStrictEqual([
        { isbn: '9780132350884', quantity: 2 },
      ]);
    });

    it('acepta el ISBN con guiones: la normalización es del dominio, no del DTO', async () => {
      await place(
        body({ items: [{ isbn: '978-0-13-235088-4', quantity: 1 }] }),
      ).expect(201);
      const command = commandBus.execute.mock.calls[0][0] as PlaceOrderCommand;
      expect(command.items[0].isbn).toBe('978-0-13-235088-4');
    });

    describe('la dirección de envío', () => {
      it('la referencia es opcional: sin ella, o en null, la compra pasa', async () => {
        const { reference: _omit, ...withoutReference } = ADDRESS;
        await place(body({ shippingAddress: withoutReference })).expect(201);
        await place(
          body({ shippingAddress: { ...ADDRESS, reference: null } }),
        ).expect(201);
        expect(commandBus.execute).toHaveBeenCalledTimes(2);
      });

      it('recorta los espacios de cada campo antes de armar el comando', async () => {
        await place(
          body({
            shippingAddress: {
              ...ADDRESS,
              recipient: '  Ana Pérez  ',
              district: ' Miraflores ',
            },
          }),
        ).expect(201);
        const command = commandBus.execute.mock
          .calls[0][0] as PlaceOrderCommand;
        expect(command.shippingAddress.recipient).toBe('Ana Pérez');
        expect(command.shippingAddress.district).toBe('Miraflores');
      });

      it('el contenido lo valida el dominio: un teléfono con letras llega al comando (da 422 allí, no 400 aquí)', async () => {
        await place(
          body({ shippingAddress: { ...ADDRESS, phone: 'llamar a Ana' } }),
        ).expect(201);
        expect(commandBus.execute).toHaveBeenCalledTimes(1);
      });

      it('acepta los campos en su largo máximo', async () => {
        await place(
          body({
            shippingAddress: {
              recipient: 'x'.repeat(100),
              phone: '9'.repeat(20),
              line1: 'x'.repeat(200),
              district: 'x'.repeat(60),
              province: 'x'.repeat(60),
              department: 'x'.repeat(60),
              reference: 'x'.repeat(200),
            },
          }),
        ).expect(201);
      });

      it('la respuesta de error por la dirección no repite lo que se envió', async () => {
        const res = await place(
          body({
            shippingAddress: {
              ...ADDRESS,
              phone: undefined,
              recipient: 'Nombre Privado',
            },
          }),
        ).expect(400);
        expect(JSON.stringify(res.body)).not.toContain('Nombre Privado');
      });
    });

    it('acepta una clave UUID en mayúsculas', async () => {
      await place(body(), KEY.toUpperCase()).expect(201);
    });

    describe('Idempotency-Key', () => {
      it.each([
        ['falta', null],
        ['está vacía', ''],
        ['no es un UUID', 'abc-123'],
        ['es un número', '12345'],
      ])('400 si %s, sin ejecutar nada', async (_n, key) => {
        const res = await place(body(), key).expect(400);
        expect(JSON.stringify(res.body)).toMatch(/Idempotency-Key/);
        expect(commandBus.execute).not.toHaveBeenCalled();
      });
    });

    describe('validación del cuerpo (400, sin ejecutar nada)', () => {
      it.each<[string, unknown]>([
        [
          'viene un customerId (el cliente es el de la sesión)',
          body({ customerId: CUSTOMER }),
        ],
        ['viene un customerId que no es UUID', body({ customerId: 'c-1' })],
        ['falta cardToken', body({ cardToken: undefined })],
        ['cardToken vacío', body({ cardToken: '' })],
        ['cardToken no es texto', body({ cardToken: 123 })],
        ['cardToken demasiado largo', body({ cardToken: 'x'.repeat(300) })],
        ['items no es una lista', body({ items: 'libro' })],
        ['items vacío', body({ items: [] })],
        ['falta items', body({ items: undefined })],
        [
          'demasiadas líneas',
          body({
            items: Array.from({ length: 101 }, () => ({
              isbn: '9780132350884',
              quantity: 1,
            })),
          }),
        ],
        ['isbn vacío', body({ items: [{ isbn: '', quantity: 1 }] })],
        [
          'isbn no es texto',
          body({ items: [{ isbn: 9780132350884, quantity: 1 }] }),
        ],
        [
          'isbn absurdamente largo',
          body({ items: [{ isbn: '9'.repeat(100), quantity: 1 }] }),
        ],
        [
          'quantity 0',
          body({ items: [{ isbn: '9780132350884', quantity: 0 }] }),
        ],
        [
          'quantity negativa',
          body({ items: [{ isbn: '9780132350884', quantity: -1 }] }),
        ],
        [
          'quantity decimal',
          body({ items: [{ isbn: '9780132350884', quantity: 1.5 }] }),
        ],
        [
          'quantity como texto',
          body({ items: [{ isbn: '9780132350884', quantity: '2' }] }),
        ],
        ['cuerpo vacío', {}],
        ['falta la dirección', body({ shippingAddress: undefined })],
        ['la dirección es null', body({ shippingAddress: null })],
        [
          'la dirección es un texto',
          body({ shippingAddress: 'Av. Larco 123' }),
        ],
        ['la dirección es una lista', body({ shippingAddress: [] })],
        ['la dirección es un objeto vacío', body({ shippingAddress: {} })],
        [
          'un campo extra en la dirección',
          body({ shippingAddress: { ...ADDRESS, country: 'PE' } }),
        ],
        ...(
          [
            'recipient',
            'phone',
            'line1',
            'district',
            'province',
            'department',
          ] as const
        ).flatMap((field) => [
          [
            `falta ${field}`,
            body({ shippingAddress: { ...ADDRESS, [field]: undefined } }),
          ] as [string, unknown],
          [
            `${field} vacío`,
            body({ shippingAddress: { ...ADDRESS, [field]: '' } }),
          ] as [string, unknown],
          [
            `${field} de espacios`,
            body({ shippingAddress: { ...ADDRESS, [field]: '   ' } }),
          ] as [string, unknown],
          [
            `${field} no es texto`,
            body({ shippingAddress: { ...ADDRESS, [field]: 123 } }),
          ] as [string, unknown],
        ]),
        [
          'recipient demasiado largo',
          body({ shippingAddress: { ...ADDRESS, recipient: 'x'.repeat(101) } }),
        ],
        [
          'phone demasiado largo',
          body({ shippingAddress: { ...ADDRESS, phone: '9'.repeat(21) } }),
        ],
        [
          'line1 demasiado larga',
          body({ shippingAddress: { ...ADDRESS, line1: 'x'.repeat(201) } }),
        ],
        [
          'district demasiado largo',
          body({ shippingAddress: { ...ADDRESS, district: 'x'.repeat(61) } }),
        ],
        [
          'province demasiado larga',
          body({ shippingAddress: { ...ADDRESS, province: 'x'.repeat(61) } }),
        ],
        [
          'department demasiado largo',
          body({ shippingAddress: { ...ADDRESS, department: 'x'.repeat(61) } }),
        ],
        [
          'reference demasiado larga',
          body({ shippingAddress: { ...ADDRESS, reference: 'x'.repeat(201) } }),
        ],
        [
          'reference no es texto',
          body({ shippingAddress: { ...ADDRESS, reference: 5 } }),
        ],
      ])('%s', async (_name, payload) => {
        await place(payload).expect(400);
        expect(commandBus.execute).not.toHaveBeenCalled();
      });

      it('rechaza campos que el cliente no debe mandar, como un precio o un total', async () => {
        await place(body({ total: '1.00' })).expect(400);
        await place(
          body({
            items: [{ isbn: '9780132350884', quantity: 1, price: '0.01' }],
          }),
        ).expect(400);
        expect(commandBus.execute).not.toHaveBeenCalled();
      });

      it('la respuesta de error nunca repite el token de la tarjeta', async () => {
        const res = await place(body({ cardToken: 123 })).expect(400);
        expect(JSON.stringify(res.body)).not.toContain(TOKEN);
      });
    });

    describe('errores del dominio', () => {
      const fails = async (error: Error, status: number) => {
        commandBus.execute.mockRejectedValue(error);
        return place().expect(status);
      };

      it('404 si el cliente o un libro no existe', async () => {
        const res = await fails(new NotFoundError('Customer', CUSTOMER), 404);
        expect(res.body).toMatchObject({
          statusCode: 404,
          errorCode: 'NOT_FOUND',
        });
      });

      it('409 mientras la misma clave sigue en curso', async () => {
        const res = await fails(
          new ConflictError('CHECKOUT_IN_PROGRESS', 'en curso'),
          409,
        );
        expect(res.body.errorCode).toBe('CHECKOUT_IN_PROGRESS');
      });

      it.each([
        new OutOfStockError('9780132350884'),
        new DomainError('PAYMENT_DECLINED', 'Pago rechazado'),
        new DomainError('IDEMPOTENCY_KEY_REUSED', 'otra compra'),
        new DomainError('INVALID_ISBN', 'ISBN inválido'),
      ])('422 para %s', async (error) => {
        const res = await fails(error, 422);
        expect(res.body.errorCode).toBe((error as DomainError).code);
      });

      it('500 para un error inesperado, sin filtrar su mensaje', async () => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const res = await fails(new Error(`falla interna con ${TOKEN}`), 500);
        expect(JSON.stringify(res.body)).not.toContain(TOKEN);
      });
    });

    it('toda respuesta lleva X-Request-Id, también un 400', async () => {
      const ok = await place().expect(201);
      const bad = await place({}).expect(400);
      expect(ok.headers['x-request-id']).toBeTruthy();
      expect(bad.headers['x-request-id']).toBeTruthy();
    });
  });

  describe('POST /orders/quote', () => {
    const QUOTE = {
      currency: 'PEN',
      lines: [
        {
          isbn: '9780132350884',
          unitPrice: Money.of('45.00'),
          quantity: 2,
          subtotal: Money.of('90.00'),
        },
      ],
      subtotal: Money.of('90.00'),
      discount: Money.of('0.00'),
      shipping: Money.of('10.00'),
      total: Money.of('100.00'),
    };
    const quoteBody = (overrides: Record<string, unknown> = {}) => ({
      items: [{ isbn: '9780132350884', quantity: 2 }],
      ...overrides,
    });
    const quote = (payload: unknown = quoteBody()) =>
      request(app.getHttpServer())
        .post('/orders/quote')
        .send(payload as object);

    beforeEach(() => {
      queryBus.execute.mockResolvedValue(QUOTE);
    });

    it('200 (no 201: no crea nada) con el desglose como { amount, currency }', async () => {
      const res = await quote().expect(200);

      expect(res.body).toEqual({
        currency: 'PEN',
        lines: [
          {
            isbn: '9780132350884',
            unitPrice: { amount: '45.00', currency: 'PEN' },
            quantity: 2,
            subtotal: { amount: '90.00', currency: 'PEN' },
          },
        ],
        subtotal: { amount: '90.00', currency: 'PEN' },
        discount: { amount: '0.00', currency: 'PEN' },
        shipping: { amount: '10.00', currency: 'PEN' },
        total: { amount: '100.00', currency: 'PEN' },
      });
    });

    it('no pide Idempotency-Key: cotizar no cobra', async () => {
      await quote().expect(200);
      expect(queryBus.execute).toHaveBeenCalledTimes(1);
    });

    it('no se guarda en cachés: depende del cliente (descuento premium)', async () => {
      const res = await quote().expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it('consulta con QuoteOrderQuery: el cliente es el de la sesión y las líneas son objetos planos', async () => {
      sessionUser = { userId: ADMIN, role: 'BUYER' };

      await quote(
        quoteBody({ items: [{ isbn: '9780132350884', quantity: 2 }] }),
      ).expect(200);

      const q = queryBus.execute.mock.calls[0][0] as QuoteOrderQuery;
      expect(q).toBeInstanceOf(QuoteOrderQuery);
      expect(q.customerId).toBe(ADMIN);
      expect(q.items).toStrictEqual([{ isbn: '9780132350884', quantity: 2 }]);
    });

    it('sin usuario en la petición (ruta mal configurada) da 401 y no consulta', async () => {
      sessionUser = undefined;
      const res = await quote().expect(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    describe('validación del cuerpo (400, sin consultar)', () => {
      it.each<[string, unknown]>([
        ['falta items', {}],
        ['items no es una lista', quoteBody({ items: 'libro' })],
        ['items vacío', quoteBody({ items: [] })],
        [
          'más de 100 líneas',
          quoteBody({
            items: Array.from({ length: 101 }, (_, i) => ({
              isbn: String(i),
              quantity: 1,
            })),
          }),
        ],
        ['una línea sin isbn', quoteBody({ items: [{ quantity: 1 }] })],
        ['isbn vacío', quoteBody({ items: [{ isbn: '', quantity: 1 }] })],
        [
          'isbn demasiado largo',
          quoteBody({ items: [{ isbn: 'x'.repeat(33), quantity: 1 }] }),
        ],
        [
          'cantidad 0',
          quoteBody({ items: [{ isbn: '9780132350884', quantity: 0 }] }),
        ],
        [
          'cantidad negativa',
          quoteBody({ items: [{ isbn: '9780132350884', quantity: -1 }] }),
        ],
        [
          'cantidad decimal',
          quoteBody({ items: [{ isbn: '9780132350884', quantity: 1.5 }] }),
        ],
        [
          'cantidad como texto',
          quoteBody({ items: [{ isbn: '9780132350884', quantity: '2' }] }),
        ],
        [
          'un customerId (el cliente es el de la sesión)',
          quoteBody({ customerId: CUSTOMER }),
        ],
        ['una dirección', quoteBody({ shippingAddress: ADDRESS })],
        ['un token de tarjeta', quoteBody({ cardToken: TOKEN })],
        ['un precio', quoteBody({ total: '1.00' })],
        [
          'un precio en una línea',
          quoteBody({
            items: [{ isbn: '9780132350884', quantity: 1, price: '0.01' }],
          }),
        ],
      ])('%s', async (_name, payload) => {
        await quote(payload).expect(400);
        expect(queryBus.execute).not.toHaveBeenCalled();
      });

      it('sin cuerpo', async () => {
        // Sin pasar por `quote()`: su parámetro por defecto convertiría "sin cuerpo" en un cuerpo válido
        await request(app.getHttpServer()).post('/orders/quote').expect(400);
        expect(queryBus.execute).not.toHaveBeenCalled();
      });

      it('acepta de 1 a 100 líneas', async () => {
        const items = Array.from({ length: 100 }, (_, i) => ({
          isbn: String(9780000000000 + i),
          quantity: 1,
        }));
        await quote(quoteBody({ items })).expect(200);
      });
    });

    describe('errores', () => {
      it('NotFoundError → 404 NOT_FOUND', async () => {
        queryBus.execute.mockRejectedValue(new NotFoundError('Book', 'x'));
        const res = await quote().expect(404);
        expect(res.body.errorCode).toBe('NOT_FOUND');
      });

      it.each(['CURRENCY_MISMATCH', 'MAX_QUANTITY_EXCEEDED', 'INVALID_ISBN'])(
        'DomainError %s → 422 con su código',
        async (code) => {
          queryBus.execute.mockRejectedValue(new DomainError(code, 'regla'));
          const res = await quote().expect(422);
          expect(res.body.errorCode).toBe(code);
        },
      );

      it('un error inesperado no da detalles', async () => {
        queryBus.execute.mockRejectedValue(new Error('secreto interno'));
        const res = await quote().expect(500);
        expect(JSON.stringify(res.body)).not.toContain('secreto interno');
      });
    });
  });

  describe('GET /orders/:id', () => {
    const view = {
      id: ORDER,
      status: 'PLACED',
      charged: { amount: '90.00', currency: 'PEN' },
      lines: [
        {
          isbn: '9780132350884',
          title: 'Clean Code',
          unitPrice: { amount: '45.00', currency: 'PEN' },
          quantity: 2,
        },
      ],
    };

    it('200 con la vista del pedido', async () => {
      queryBus.execute.mockResolvedValue(view);
      const res = await request(app.getHttpServer())
        .get(`/orders/${ORDER}`)
        .expect(200);
      expect(res.body).toEqual(view);
    });

    it('consulta con GetOrderQuery, el id y quién pregunta (su id y su rol, del token)', async () => {
      queryBus.execute.mockResolvedValue(view);
      await request(app.getHttpServer()).get(`/orders/${ORDER}`).expect(200);
      const query = queryBus.execute.mock.calls[0][0] as GetOrderQuery;
      expect(query).toBeInstanceOf(GetOrderQuery);
      expect(query.id).toBe(ORDER);
      expect(query.requester).toEqual({ userId: CUSTOMER, role: 'BUYER' });
    });

    it('un administrador pregunta con su rol', async () => {
      sessionUser = { userId: ADMIN, role: 'ADMIN' };
      queryBus.execute.mockResolvedValue(view);
      await request(app.getHttpServer()).get(`/orders/${ORDER}`).expect(200);
      expect(
        (queryBus.execute.mock.calls[0][0] as GetOrderQuery).requester,
      ).toEqual({ userId: ADMIN, role: 'ADMIN' });
    });

    it('sin usuario en la petición (ruta mal configurada) da 401 y no consulta', async () => {
      sessionUser = undefined;
      const res = await request(app.getHttpServer())
        .get(`/orders/${ORDER}`)
        .expect(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('400 si el id no es un UUID, sin consultar', async () => {
      await request(app.getHttpServer()).get('/orders/no-es-uuid').expect(400);
      await request(app.getHttpServer()).get('/orders/123').expect(400);
      expect(queryBus.execute).not.toHaveBeenCalled();
    });

    it('404 si el pedido no existe', async () => {
      queryBus.execute.mockRejectedValue(new NotFoundError('Order', ORDER));
      const res = await request(app.getHttpServer())
        .get(`/orders/${ORDER}`)
        .expect(404);
      expect(res.body.errorCode).toBe('NOT_FOUND');
    });
  });

  describe('Swagger', () => {
    it('documenta POST /orders con la clave de idempotencia obligatoria y sus respuestas', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const post = doc.paths['/orders'].post!;
      const params = (post.parameters ?? []) as {
        name: string;
        in: string;
        required?: boolean;
      }[];

      expect(params.find((p) => p.name === 'Idempotency-Key')).toMatchObject({
        in: 'header',
        required: true,
      });
      expect(
        Object.keys(post.responses).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['201', '400', '401', '403', '404', '409', '422']);
    });

    it('documenta GET /orders/{id} con 200, 400 y 404', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const get = doc.paths['/orders/{id}'].get!;
      expect(
        Object.keys(get.responses).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['200', '400', '401', '404']);
    });

    it('documenta POST /orders/quote: 200 con el desglose y los errores de acceso y de reglas', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const post = doc.paths['/orders/quote'].post!;
      expect(
        Object.keys(post.responses).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['200', '400', '401', '403', '404', '422']);
      const ok = post.responses['200'] as {
        content: Record<string, { schema: { $ref: string } }>;
      };
      expect(ok.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/OrderQuoteResponse',
      );
      const schemas = doc.components!.schemas as Record<
        string,
        { properties: Record<string, unknown> }
      >;
      expect(
        Object.keys(schemas.OrderQuoteResponse.properties).sort((a, b) =>
          a.localeCompare(b),
        ),
      ).toEqual([
        'currency',
        'discount',
        'lines',
        'shipping',
        'subtotal',
        'total',
      ]);
      expect(
        Object.keys(schemas.QuoteLineResponse.properties).sort((a, b) =>
          a.localeCompare(b),
        ),
      ).toEqual(['isbn', 'quantity', 'subtotal', 'unitPrice']);
      expect(Object.keys(schemas.QuoteOrderDto.properties)).toEqual(['items']);
      expect(post.parameters ?? []).not.toContainEqual(
        expect.objectContaining({ name: 'Idempotency-Key' }),
      );
    });

    it('documenta que GET /orders/{id} devuelve el pedido con su dirección (DP-15), que puede ser null', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const get = doc.paths['/orders/{id}'].get!;
      const ok = get.responses['200'] as {
        content: Record<string, { schema: { $ref: string } }>;
      };
      expect(ok.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/OrderDetailResponse',
      );
      const schemas = doc.components!.schemas as Record<
        string,
        {
          properties: Record<string, { nullable?: boolean }>;
          required?: string[];
        }
      >;
      const detail = schemas.OrderDetailResponse;
      expect(
        Object.keys(detail.properties).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['charged', 'id', 'lines', 'shippingAddress', 'status']);
      expect(detail.properties.shippingAddress.nullable).toBe(true);
      expect(detail.required).toContain('shippingAddress');
    });

    it('documenta la dirección de envío con sus siete campos, la referencia opcional', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const schemas = doc.components!.schemas as Record<
        string,
        { properties: Record<string, unknown>; required?: string[] }
      >;
      const address = schemas.ShippingAddressDto;
      expect(
        Object.keys(address.properties).sort((a, b) => a.localeCompare(b)),
      ).toEqual([
        'department',
        'district',
        'line1',
        'phone',
        'province',
        'recipient',
        'reference',
      ]);
      expect(address.required).not.toContain('reference');
      expect(address.required).toEqual(
        expect.arrayContaining([
          'recipient',
          'phone',
          'line1',
          'district',
          'province',
          'department',
        ]),
      );
    });

    it('describe los montos como texto y el cuerpo con sus campos', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const schemas = doc.components!.schemas as Record<
        string,
        { properties: Record<string, { type?: string }> }
      >;
      expect(
        Object.keys(schemas.PlaceOrderDto.properties).sort((a, b) =>
          a.localeCompare(b),
        ),
      ).toEqual(['cardToken', 'items', 'shippingAddress']);
      expect(schemas.OrderMoneyResponse.properties.amount.type).toBe('string');
    });
  });
});
