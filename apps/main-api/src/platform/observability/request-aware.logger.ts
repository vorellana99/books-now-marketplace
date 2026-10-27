import { ConsoleLogger } from '@nestjs/common';
import { RequestContext } from './request-context.js';

// Agrega el requestId a cada línea del log: como campo en JSON, o como prefijo en texto
export class RequestAwareLogger extends ConsoleLogger {
  override log(message: unknown, ...rest: unknown[]) {
    super.log(this.tag(message), ...rest);
  }
  override warn(message: unknown, ...rest: unknown[]) {
    super.warn(this.tag(message), ...rest);
  }
  override error(message: unknown, ...rest: unknown[]) {
    super.error(this.tag(message), ...rest);
  }

  private tag(message: unknown) {
    const requestId = RequestContext.requestId();
    if (!requestId) return message;
    if (!this.options.json && typeof message === 'string') {
      return `[${requestId}] ${message}`;
    }
    return { requestId, message };
  }
}
