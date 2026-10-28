import { Logger, type INestApplication } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GetOrderQuery } from '../../src/contexts/sales/application/order/get-order.query.js';
import { PlaceOrderCommand } from '../../src/contexts/sales/application/order/place-order.command.js';
import { Money } from '../../src/contexts/sales/domain/shared/money.vo.js';
import { OrderController } from '../../src/contexts/sales/infrastructure/order/order.controller.js';
import { OutOfStockError } from '../../src/contracts/inventory/stock.errors.js';
import { configureApp } from '../../src/platform/http/configure-app.js';
import {
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';

const KEY = '0196a000-0000-7000-8000-0000000000aa';
const CUSTOMER = '0196a000-0000-7000-8000-0000000000bb';
const ORDER = '0196a000-0000-7000-8000-0000000000cc';
const TOKEN = 'tok_secreto_123';

const body = (overrides: Record<string, unknown> = {}) => ({
  customerId: CUSTOMER,
  cardToken: TOKEN,
  items: [{ isbn: '9780132350884', quantity: 2 }],
  ...overrides,
});

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
      it.each([
        ['customerId no es UUID', body({ customerId: 'c-1' })],
        ['falta customerId', body({ customerId: undefined })],
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
        const res = await place(body({ customerId: 'no-uuid' })).expect(400);
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

    it('consulta con GetOrderQuery y el id', async () => {
      queryBus.execute.mockResolvedValue(view);
      await request(app.getHttpServer()).get(`/orders/${ORDER}`).expect(200);
      const query = queryBus.execute.mock.calls[0][0] as GetOrderQuery;
      expect(query).toBeInstanceOf(GetOrderQuery);
      expect(query.id).toBe(ORDER);
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
      ).toEqual(['201', '400', '404', '409', '422']);
    });

    it('documenta GET /orders/{id} con 200, 400 y 404', () => {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const get = doc.paths['/orders/{id}'].get!;
      expect(
        Object.keys(get.responses).sort((a, b) => a.localeCompare(b)),
      ).toEqual(['200', '400', '404']);
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
      ).toEqual(['cardToken', 'customerId', 'items']);
      expect(schemas.OrderMoneyResponse.properties.amount.type).toBe('string');
    });
  });
});
