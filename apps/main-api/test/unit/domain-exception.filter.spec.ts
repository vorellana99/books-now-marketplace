import { ArgumentsHost } from '@nestjs/common';
import {
  OutOfStockError,
  StockItemNotFoundError,
} from '../../src/contracts/inventory/stock.errors.js';
import { DomainExceptionFilter } from '../../src/platform/http/domain-exception.filter.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../src/shared-kernel/domain.errors.js';

function respond(error: DomainError) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new DomainExceptionFilter().catch(error, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('DomainExceptionFilter', () => {
  it('DomainError → 422', () => {
    expect(respond(new DomainError('OUT_OF_STOCK', 'sin stock'))).toEqual({
      status: 422,
      body: {
        statusCode: 422,
        errorCode: 'OUT_OF_STOCK',
        message: 'sin stock',
      },
    });
  });

  it('NotFoundError → 404', () => {
    expect(respond(new NotFoundError('Book', '123')).status).toBe(404);
  });

  it('ConflictError → 409', () => {
    expect(
      respond(new ConflictError('CHECKOUT_IN_PROGRESS', 'en curso')).status,
    ).toBe(409);
  });

  it('AuthenticationError → 401, con su código', () => {
    expect(
      respond(new AuthenticationError('INVALID_CREDENTIALS', 'no entra')),
    ).toEqual({
      status: 401,
      body: {
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'no entra',
      },
    });
  });

  it('AuthorizationError → 403, con su código', () => {
    expect(respond(new AuthorizationError('FORBIDDEN', 'sin permiso'))).toEqual(
      {
        status: 403,
        body: {
          statusCode: 403,
          errorCode: 'FORBIDDEN',
          message: 'sin permiso',
        },
      },
    );
  });

  it('OutOfStockError (de Inventario) → 422 OUT_OF_STOCK', () => {
    const { status, body } = respond(new OutOfStockError('9780306406157'));
    expect(status).toBe(422);
    expect(body).toMatchObject({ errorCode: 'OUT_OF_STOCK' });
    expect(body.message).toContain('9780306406157');
  });

  it('StockItemNotFoundError → 422 (no 404: el libro existe en Catálogo)', () => {
    const { status, body } = respond(
      new StockItemNotFoundError('9780306406157'),
    );
    expect(status).toBe(422);
    expect(body.errorCode).toBe('STOCK_ITEM_NOT_FOUND');
  });
});
