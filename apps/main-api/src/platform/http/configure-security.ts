import { Logger, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { accessLog } from '../observability/access-log.middleware.js';

// La API devuelve JSON: la política más estricta posible (helmet por defecto). La documentación de Swagger UI necesita
// sus scripts y estilos propios, y nada más, así que solo /docs recibe una política algo más abierta
const strictDirectives = {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  'style-src': ["'self'"], // el valor por defecto de helmet admite estilos incrustados: la API no los necesita
  'img-src': ["'self'"],
  'font-src': ["'self'"],
};
const apiHeaders = helmet({
  contentSecurityPolicy: { directives: strictDirectives },
});
const docsHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'style-src': ["'self'", "'unsafe-inline'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:', 'validator.swagger.io'],
      'upgrade-insecure-requests': null, // la documentación también se abre por http en desarrollo
    },
  },
});
const isDocs = (path: string) => path === '/docs' || path.startsWith('/docs/');

// Cabeceras de seguridad, CORS, la dirección del cliente detrás de un proxy y el registro de accesos. Va después de
// configureApp (que pone el requestId) y la usan main.ts y los tests e2e
export function configureSecurity(app: INestApplication): void {
  const config = app.get(ConfigService);

  const hops = config.getOrThrow<number>('TRUST_PROXY');
  app.getHttpAdapter().getInstance().set('trust proxy', hops);

  app.use(accessLog(new Logger('Access')));
  app.use((req: Request, res: Response, next: NextFunction) =>
    (isDocs(req.path) ? docsHeaders : apiHeaders)(req, res, next),
  );

  const origins = config.getOrThrow<string[]>('CORS_ORIGINS');
  app.enableCors({
    // false = sin CORS. Una lista compara el origen entero, sin distinguir nada más que la coincidencia exacta
    origin: origins.length > 0 ? origins : false,
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Request-Id',
    ],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 600,
    credentials: false, // la sesión viaja en Authorization, no en cookies
    optionsSuccessStatus: 204,
  });
}
