import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpException,
  InternalServerErrorException,
  Logger,
  MethodNotAllowedException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiExceptionFilter } from '../../../src/platform/http/api-exception.filter.js';
import {
  ConflictError,
  DomainError,
} from '../../../src/shared-kernel/domain.errors.js';

function respond(error: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  new ApiExceptionFilter().catch(error, host);
  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe('ApiExceptionFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('errores de dominio (no cambian)', () => {
    it('DomainError → 422 con su código', () => {
      expect(respond(new DomainError('OUT_OF_STOCK', 'sin stock'))).toEqual({
        status: 422,
        body: {
          statusCode: 422,
          errorCode: 'OUT_OF_STOCK',
          message: 'sin stock',
        },
      });
    });

    it('ConflictError → 409 con su código', () => {
      const { status, body } = respond(
        new ConflictError('CHECKOUT_IN_PROGRESS', 'en curso'),
      );
      expect(status).toBe(409);
      expect(body.errorCode).toBe('CHECKOUT_IN_PROGRESS');
    });
  });

  describe('validación (400)', () => {
    it('una lista de fallos: message fijo y la lista en details', () => {
      expect(
        respond(
          new BadRequestException([
            'items debe tener al menos 1 elemento',
            'cardToken no puede estar vacío',
          ]),
        ),
      ).toEqual({
        status: 400,
        body: {
          statusCode: 400,
          errorCode: 'VALIDATION_ERROR',
          message: 'La petición no es válida',
          details: [
            'items debe tener al menos 1 elemento',
            'cardToken no puede estar vacío',
          ],
        },
      });
    });

    it('un solo texto: es el message y no hay details', () => {
      const { status, body } = respond(
        new BadRequestException('Falta el header Idempotency-Key'),
      );
      expect(status).toBe(400);
      expect(body).toEqual({
        statusCode: 400,
        errorCode: 'VALIDATION_ERROR',
        message: 'Falta el header Idempotency-Key',
      });
      expect('details' in body).toBe(false);
    });
  });

  describe('otros errores HTTP de Nest', () => {
    it('ruta inexistente (404) → ROUTE_NOT_FOUND, distinto del NOT_FOUND de dominio', () => {
      const { status, body } = respond(
        new NotFoundException('Cannot GET /no-existe'),
      );
      expect(status).toBe(404);
      expect(body.errorCode).toBe('ROUTE_NOT_FOUND');
      expect(body.errorCode).not.toBe('NOT_FOUND');
      expect(body.statusCode).toBe(404);
      expect(typeof body.message).toBe('string');
    });

    it('método no permitido (405) → METHOD_NOT_ALLOWED', () => {
      const { status, body } = respond(new MethodNotAllowedException());
      expect(status).toBe(405);
      expect(body.errorCode).toBe('METHOD_NOT_ALLOWED');
    });

    it('403 y 413 tienen su propio código', () => {
      expect(respond(new ForbiddenException('no')).body.errorCode).toBe(
        'FORBIDDEN',
      );
      expect(respond(new PayloadTooLargeException()).body.errorCode).toBe(
        'PAYLOAD_TOO_LARGE',
      );
    });

    it('un 4xx sin código propio cae en REQUEST_ERROR, siempre con errorCode', () => {
      const { status, body } = respond({ status: 418, message: 'soy tetera' });
      expect(status).toBe(418);
      expect(body.errorCode).toBe('REQUEST_ERROR');
      expect(body.message).toBe('soy tetera');
    });

    it('un error de body-parser (JSON mal formado) es un 400 de validación', () => {
      const { status, body } = respond(
        Object.assign(new SyntaxError('Unexpected token'), {
          status: 400,
          type: 'entity.parse.failed',
        }),
      );
      expect(status).toBe(400);
      expect(body.errorCode).toBe('VALIDATION_ERROR');
    });

    it('un 5xx deliberado de Nest (503 de salud) conserva su cuerpo', () => {
      const health = { status: 'error', details: { database: 'down' } };
      expect(respond(new ServiceUnavailableException(health))).toEqual({
        status: 503,
        body: health,
      });
    });
  });

  describe('un 500 que no es un error inesperado de programación (9.15: lo que las mutaciones encontraron)', () => {
    it('una InternalServerErrorException de Nest responde INTERNAL_ERROR sin revelar su texto', () => {
      const { status, body } = respond(
        new InternalServerErrorException('secreto interno'),
      );
      expect(status).toBe(500);
      expect(body).toEqual({
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
      expect(JSON.stringify(body)).not.toContain('secreto');
    });

    it('un error de Express con status 500 no se toma por un error del cliente: es un 500 genérico', () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { status, body } = respond({
        status: 500,
        message: 'detalle interno',
      });
      expect(status).toBe(500);
      expect(body.errorCode).toBe('INTERNAL_ERROR');
      expect(JSON.stringify(body)).not.toContain('detalle interno');
    });

    it('un HttpException sin mensaje nunca deja `message` vacío', () => {
      const { body } = respond(new HttpException({}, 400));
      expect(body.errorCode).toBe('VALIDATION_ERROR');
      expect(body.message).toBe('VALIDATION_ERROR');
      expect(body.message.length).toBeGreaterThan(0);
    });
  });

  describe('errores inesperados (500)', () => {
    it('responde INTERNAL_ERROR sin revelar el error interno', () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { status, body } = respond(
        new Error('connection refused postgres://u:secreto@db/libroya'),
      );
      expect(status).toBe(500);
      expect(body).toEqual({
        statusCode: 500,
        errorCode: 'INTERNAL_ERROR',
        message: 'Error interno del servidor',
      });
      expect(JSON.stringify(body)).not.toContain('secreto');
    });

    it('lo escribe en el log con su traza', () => {
      const error = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      respond(new Error('algo se rompió'));
      expect(error).toHaveBeenCalledTimes(1);
      expect(String(error.mock.calls[0][0])).toContain('algo se rompió');
    });

    it('un valor que no es un Error (throw "texto") también es un 500', () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const { status, body } = respond('texto suelto');
      expect(status).toBe(500);
      expect(body.errorCode).toBe('INTERNAL_ERROR');
    });
  });
});
