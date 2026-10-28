import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import {
  AuthenticationError,
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
            : 422;
    host.switchToHttp().getResponse().status(status).json({
      statusCode: status,
      errorCode: error.code,
      message: error.message,
    });
  }
}
