import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import {
  AuthenticationError,
  AuthorizationError,
} from '../../shared-kernel/domain.errors.js';
import { RequestContext } from '../observability/request-context.js';
import {
  AccessTokenVerifier,
  TokenVerificationError,
} from './access-token-verifier.js';
import type { AuthenticatedRequest } from './current-user.decorator.js';
import { routeAccess } from './route-access.js';

// RFC 6750: esquema Bearer y un token de caracteres de base64url, con el relleno opcional
const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i;

// Denegado por defecto: toda ruta exige un token de acceso válido, salvo las marcadas @Public. @Roles añade el rol.
// Es global, así que una ruta nueva sin decidir su acceso no queda abierta. Depende del puerto AccessTokenVerifier y
// no de Identidad. Un guard corre antes que el interceptor que abre el RequestContext, así que el requestId de los
// avisos se lee de la petición
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { isPublic, roles } = routeAccess(
      this.reflector,
      context.getHandler(),
      context.getClass(),
    );
    if (isPublic) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request & AuthenticatedRequest>();
    const res = http.getResponse<Response>();

    const header = req.headers.authorization;
    const token = header === undefined ? undefined : BEARER.exec(header)?.[1];
    if (token === undefined) {
      res.setHeader(
        'WWW-Authenticate',
        header === undefined ? 'Bearer' : 'Bearer error="invalid_token"',
      );
      throw this.deny(
        req,
        new AuthenticationError(
          'UNAUTHENTICATED',
          'Se requiere un token de acceso válido',
        ),
      );
    }

    try {
      req.user = await this.verifier.verify(token);
    } catch (error) {
      if (!(error instanceof TokenVerificationError)) throw error;
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      throw this.deny(
        req,
        error.reason === 'expired'
          ? new AuthenticationError(
              'TOKEN_EXPIRED',
              'El token de acceso venció: renueve la sesión',
            )
          : new AuthenticationError(
              'UNAUTHENTICATED',
              'Se requiere un token de acceso válido',
            ),
      );
    }

    if (roles && !roles.includes(req.user.role)) {
      throw this.deny(
        req,
        new AuthorizationError(
          'FORBIDDEN',
          'No tiene permiso para esta operación',
        ),
        req.user.userId,
      );
    }
    return true;
  }

  private deny<E extends AuthenticationError | AuthorizationError>(
    req: Request & { requestId?: string },
    error: E,
    userId?: string,
  ): E {
    const status = error instanceof AuthorizationError ? 403 : 401;
    const run = (message: string) =>
      req.requestId
        ? RequestContext.run(req.requestId, () => this.logger.warn(message))
        : this.logger.warn(message);
    // Solo el método y la ruta, sin la query (puede traer datos de la persona) y nunca el token
    run(
      `Acceso denegado ${status} ${error.code} ${req.method} ${req.path}${userId ? ` (usuario ${userId})` : ''}`,
    );
    return error;
  }
}
