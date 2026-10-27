import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Solo decide el ID y lo devuelve. NO abre el contexto: el body-parser, que corre después,
// continúa desde eventos del stream y lo perdería (problema conocido de AsyncLocalStorage con Express)
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.header('x-request-id');
  // Solo se acepta un valor con formato razonable: evita inyectar texto arbitrario en los logs
  const requestId =
    incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId); // el cliente puede reportarlo
  next();
}
