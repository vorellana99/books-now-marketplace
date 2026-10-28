import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '../../shared-kernel/domain.errors.js';

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const status =
      error instanceof NotFoundError
        ? 404
        : error instanceof ConflictError
          ? 409
          : error instanceof AuthenticationError
            ? 401
            : error instanceof AuthorizationError
              ? 403
              : 422;
    host.switchToHttp().getResponse().status(status).json({
      statusCode: status,
      errorCode: error.code,
      message: error.message,
    });
  }
}
