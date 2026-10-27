import { ConsoleLogger } from '@nestjs/common';
import { RequestContext } from './request-context.js';

// Agrega el requestId a cada línea del log JSON
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
    return requestId ? { requestId, message } : message;
  }
}
