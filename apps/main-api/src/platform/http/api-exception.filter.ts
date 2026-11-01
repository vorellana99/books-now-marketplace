import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { DomainError } from '../../shared-kernel/domain.errors.js';
import { DomainExceptionFilter } from './domain-exception.filter.js';

// El código de los errores que no son de dominio. Son distintos a propósito de los del dominio: `NOT_FOUND` ya significa
// «el libro no existe», y una ruta inexistente no debe poder confundirse con él
const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'ROUTE_NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  413: 'PAYLOAD_TOO_LARGE',
  429: 'TOO_MANY_REQUESTS',
};
const UNKNOWN_CLIENT_ERROR = 'REQUEST_ERROR';
const VALIDATION_MESSAGE = 'La petición no es válida';
const INTERNAL_MESSAGE = 'Error interno del servidor';
const MALFORMED_JSON_MESSAGE = 'El cuerpo no es un JSON válido';

interface ErrorBody {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: string[];
}

// Que toda respuesta de error tenga la forma { statusCode, errorCode, message }: los errores de dominio los resuelve
// `DomainExceptionFilter`; aquí van los de Nest (validación, ruta inexistente…), los de Express (JSON mal formado, cuerpo
// demasiado grande) y los inesperados, que responden 500 sin revelar nada del error y quedan en el log
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  private readonly domain = new DomainExceptionFilter();

  catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof DomainError) {
      this.domain.catch(exception, host);
      return;
    }
    const response = host.switchToHttp().getResponse();
    if (exception instanceof HttpException) {
      this.sendHttpException(exception, response);
      return;
    }
    const status = clientErrorStatus(exception);
    if (status !== undefined) {
      const body = this.clientError(status, exception);
      response.status(status).json(body);
      return;
    }
    this.logger.error(
      `Error no controlado: ${describe(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response
      .status(500)
      .json(this.body(500, 'INTERNAL_ERROR', INTERNAL_MESSAGE));
  }

  private sendHttpException(
    exception: HttpException,
    response: { status(code: number): { json(body: unknown): void } },
  ): void {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    if (status >= 500) {
      // Un 5xx que Nest lanza a propósito con su propio cuerpo (el 503 de la salud lo lee el balanceador) se conserva
      if (typeof payload === 'object' && !('statusCode' in payload)) {
        response.status(status).json(payload);
        return;
      }
      response
        .status(status)
        .json(this.body(status, 'INTERNAL_ERROR', INTERNAL_MESSAGE));
      return;
    }
    const message =
      typeof payload === 'string'
        ? payload
        : (payload as { message?: string | string[] }).message;
    response.status(status).json(this.clientBody(status, message));
  }

  private clientError(status: number, error: unknown): ErrorBody {
    const type = (error as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      return this.body(status, 'VALIDATION_ERROR', MALFORMED_JSON_MESSAGE);
    }
    const message = (error as { message?: unknown }).message;
    return this.clientBody(
      status,
      typeof message === 'string' ? message : undefined,
    );
  }

  private clientBody(
    status: number,
    message: string | string[] | undefined,
  ): ErrorBody {
    const errorCode = CODE_BY_STATUS[status] ?? UNKNOWN_CLIENT_ERROR;
    if (Array.isArray(message)) {
      // La lista de fallos de la validación va aparte, para que `message` sea siempre un texto
      return {
        ...this.body(status, errorCode, VALIDATION_MESSAGE),
        details: message,
      };
    }
    return this.body(status, errorCode, message ?? errorCode);
  }

  private body(status: number, errorCode: string, message: string): ErrorBody {
    return { statusCode: status, errorCode, message };
  }
}

// Express (body-parser) lanza errores con `status`, que no son HttpException de Nest
function clientErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && status >= 400 && status < 500
    ? status
    : undefined;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
