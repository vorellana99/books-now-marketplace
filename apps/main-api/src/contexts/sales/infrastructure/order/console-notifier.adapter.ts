import { Injectable, Logger } from '@nestjs/common';
import { Notifier } from '../../domain/order/notifier.port.js';

// Todavía no hay proveedor de email: el correo se escribe en el log. Como el log lleva el requestId, se puede
// seguir una compra desde la petición hasta el correo que dispara
@Injectable()
export class ConsoleNotifier extends Notifier {
  private readonly logger = new Logger(ConsoleNotifier.name);

  send(
    to: string,
    message: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    const key = options?.idempotencyKey;
    this.logger.log(
      `Email a ${to}: ${message}${key ? ` (clave de idempotencia ${key})` : ''}`,
    );
    return Promise.resolve();
  }
}
