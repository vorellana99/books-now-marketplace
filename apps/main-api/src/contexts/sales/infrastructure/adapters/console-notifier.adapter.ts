import { Logger } from '@nestjs/common';
import { Notifier } from '../../domain/ports/notifier.port.js';

// Todavía no hay proveedor de email: el correo se escribe en el log. Como el log lleva el requestId, se puede
// seguir una compra desde la petición hasta el correo que dispara.
// Tarda `delayMs`, como un proveedor de verdad: así el consumidor `external` del relay, que corre fuera de toda
// transacción, se ejercita con un servicio lento. El log se escribe al terminar la espera, cuando el correo "salió"
export class ConsoleNotifier extends Notifier {
  private readonly logger = new Logger(ConsoleNotifier.name);

  constructor(readonly delayMs = 0) {
    super();
    if (!Number.isInteger(delayMs) || delayMs < 0) {
      throw new Error(
        `La demora del notificador debe ser un entero de 0 o más, y llegó ${delayMs}`,
      );
    }
  }

  async send(
    to: string,
    message: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    const key = options?.idempotencyKey;
    this.logger.log(
      `Email a ${to}: ${message}${key ? ` (clave de idempotencia ${key})` : ''}`,
    );
  }
}
