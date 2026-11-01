import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
  TooManyRequestsError,
} from '../../shared-kernel/domain.errors.js';

// Qué estado HTTP corresponde a cada clase de error de dominio. Se recorre en orden y gana la primera que coincide;
// cualquier otro DomainError es una regla de negocio incumplida: 422
const STATUS_BY_ERROR: [new (...args: never[]) => DomainError, number][] = [
  [NotFoundError, 404],
  [ConflictError, 409],
  [AuthenticationError, 401],
  [AuthorizationError, 403],
  [TooManyRequestsError, 429],
];
const BUSINESS_RULE_STATUS = 422;

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const status =
      STATUS_BY_ERROR.find(([type]) => error instanceof type)?.[1] ??
      BUSINESS_RULE_STATUS;
    host.switchToHttp().getResponse().status(status).json({
      statusCode: status,
      errorCode: error.code,
      message: error.message,
    });
  }
}
