import { type ExecutionContext, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerOptions,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { RequestContext } from '../../../platform/observability/request-context.js';
import { TooManyRequestsError } from '../../../shared-kernel/domain.errors.js';
import { AuthController } from './auth.controller.js';

const MAX_EMAIL_KEY = 254;

// Solo las rutas de /auth que se nombran: el resto de la API no se limita
const onlyFor =
  (...handlers: string[]) =>
  (context: ExecutionContext): boolean =>
    !(
      context.getClass() === AuthController &&
      handlers.includes(context.getHandler().name)
    );

const bodyEmail = (req: { body?: unknown }): string | undefined => {
  const email = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : undefined;
};

// Los límites de intentos de /auth. Cada uno cuenta aparte, por dirección o por cuenta, y todos los intentos cuentan
// (también los correctos y los de un cuerpo inválido: el límite va antes de la validación). Los contadores viven en
// memoria de cada instancia, así que con varias instancias el límite real es el de cada una por separado
export function authThrottlers(config: ConfigService): ThrottlerOptions[] {
  const ttl = config.getOrThrow<number>('RATE_LIMIT_WINDOW_SECONDS') * 1000;
  const limit = (name: string) => config.getOrThrow<number>(name);
  return [
    {
      name: 'login-ip',
      ttl,
      limit: limit('RATE_LIMIT_LOGIN_IP'),
      skipIf: onlyFor('login'),
    },
    {
      // Por cuenta: contra el mismo correo, vengan de donde vengan. El correo se normaliza como lo hace el login, y
      // con un tope de largo: la clave no crece sin límite. Un cuerpo sin correo de texto no cuenta aquí (lo cuenta la
      // dirección y la validación lo rechaza). Cortar una cuenta durante la ventana permite que alguien bloquee a otra
      // persona a propósito; se acepta porque dura solo la ventana
      name: 'login-account',
      ttl,
      limit: limit('RATE_LIMIT_LOGIN_ACCOUNT'),
      skipIf: (context) =>
        onlyFor('login')(context) ||
        bodyEmail(context.switchToHttp().getRequest<Request>()) === undefined,
      getTracker: (req) =>
        `account:${(bodyEmail(req) ?? '').trim().toLowerCase().slice(0, MAX_EMAIL_KEY)}`,
    },
    {
      name: 'register-ip',
      ttl,
      limit: limit('RATE_LIMIT_REGISTER_IP'),
      skipIf: onlyFor('register'),
    },
    {
      name: 'session-ip',
      ttl,
      limit: limit('RATE_LIMIT_REFRESH_IP'),
      skipIf: onlyFor('refresh', 'logout'),
      // Un solo contador para las dos rutas (por defecto cada ruta tendría el suyo)
      generateKey: (_context, tracker, name) => `${name}:${tracker}`,
    },
  ];
}

// El guard de @nestjs/throttler, con nuestra respuesta: 429 con el cuerpo de siempre y Retry-After, y un aviso en el
// log con el requestId y qué límite saltó, sin el correo ni nada del cuerpo
export class AuthThrottlerGuard extends ThrottlerGuard {
  private readonly warnLog = new Logger('RateLimit');

  protected override async handleRequest(
    props: Parameters<ThrottlerGuard['handleRequest']>[0],
  ): Promise<boolean> {
    const { req } = this.getRequestResponse(props.context);
    (req as { rateLimitName?: string }).rateLimitName = props.throttler.name;
    return super.handleRequest(props);
  }

  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const { req, res } = this.getRequestResponse(context) as {
      req: Request & { requestId?: string; rateLimitName?: string };
      res: Response;
    };
    const wait = Math.max(1, Math.ceil(detail.timeToBlockExpire));
    res.setHeader('Retry-After', String(wait));
    const text = `Límite de intentos superado (${req.rateLimitName ?? 'desconocido'}): ${req.method} ${req.path} desde ${req.ip}`;
    if (req.requestId) {
      RequestContext.run(req.requestId, () => this.warnLog.warn(text));
    } else {
      this.warnLog.warn(text);
    }
    throw new TooManyRequestsError(
      'TOO_MANY_REQUESTS',
      `Demasiados intentos: espere ${wait} ${wait === 1 ? 'segundo' : 'segundos'} e intente de nuevo`,
    );
  }
}
