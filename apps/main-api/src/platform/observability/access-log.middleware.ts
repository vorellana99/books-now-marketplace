import type { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContext } from './request-context.js';

const MAX_PATH = 200;
const NOT_PRINTABLE = /[^\x20-\x7e]/g;

// Rutas que el balanceador consulta cada pocos segundos: escribirlas ahogaría el resto
const isHealthCheck = (path: string) =>
  path === '/health' || path.startsWith('/health/');

// Lo justo para saber quién pidió qué y cómo salió: una línea por petición, al terminar. Solo método, ruta (sin la query,
// que puede traer datos de la persona o un token), estado, duración y el usuario si lo hay. Nunca cabeceras, cookies ni
// cuerpo. Los caracteres no imprimibles de la ruta se sustituyen: una ruta con saltos de línea no puede inventar líneas
export function accessLog(
  logger: Pick<Logger, 'log' | 'warn' | 'error'>,
  now: () => number = Date.now,
) {
  return (
    req: Request & { requestId?: string },
    res: Response,
    next: NextFunction,
  ): void => {
    const startedAt = now();
    res.once('close', () => {
      if (isHealthCheck(req.path)) return;
      let path = req.path.replace(NOT_PRINTABLE, '?');
      if (path.length > MAX_PATH) path = `${path.slice(0, MAX_PATH)}…`;
      const user = (req as { user?: { userId: string } }).user;
      const suffix = user ? ` usuario=${user.userId}` : '';
      // Si la conexión se cerró antes de terminar la respuesta, el estado no es el que verá el cliente
      const aborted = !res.writableFinished;
      const status = res.statusCode;
      const text = aborted
        ? `${req.method} ${path} cancelada ${now() - startedAt}ms${suffix}`
        : `${req.method} ${path} ${status} ${now() - startedAt}ms${suffix}`;
      const write = () => {
        if (aborted || (status >= 400 && status < 500)) logger.warn(text);
        else if (status >= 500) logger.error(text);
        else logger.log(text);
      };
      if (req.requestId) RequestContext.run(req.requestId, write);
      else write();
    });
    next();
  };
}
