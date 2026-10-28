import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { RequestContext } from './request-context.js';

// Agrega el requestId a cada línea del log: como campo de primer nivel en JSON, o como prefijo `[id]` en texto.
// Se hace al formatear y no al llamar a log/warn/error, así que cubre los seis niveles. En JSON, `message`
// conserva siempre su tipo: un campo que unas veces es texto y otras un objeto rompe los indexadores de logs
export class RequestAwareLogger extends ConsoleLogger {
  protected override getJsonLogObject(
    message: unknown,
    options: Parameters<ConsoleLogger['getJsonLogObject']>[1],
  ) {
    const entry = super.getJsonLogObject(message, options);
    const requestId = RequestContext.requestId();
    return requestId ? { ...entry, requestId } : entry;
  }

  protected override stringifyMessage(
    message: unknown,
    logLevel: LogLevel,
  ): string {
    const requestId = RequestContext.requestId();
    if (!requestId) return super.stringifyMessage(message, logLevel);
    // El prefijo va antes de dar color, para que lo lleve igual que el resto del mensaje
    return super.stringifyMessage(
      typeof message === 'string'
        ? `[${requestId}] ${message}`
        : { requestId, message },
      logLevel,
    );
  }
}
