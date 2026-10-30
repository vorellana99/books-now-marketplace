import { Notifier } from '../../src/contexts/sales/domain/ports/notifier.port.js';

export class FakeNotifier extends Notifier {
  readonly sent: { to: string; message: string; idempotencyKey?: string }[] =
    [];

  constructor(private readonly options: { fails?: boolean } = {}) {
    super();
  }

  send(
    to: string,
    message: string,
    options?: { idempotencyKey?: string },
  ): Promise<void> {
    if (this.options.fails)
      return Promise.reject(new Error('El proveedor de email falló'));
    this.sent.push({ to, message, idempotencyKey: options?.idempotencyKey });
    return Promise.resolve();
  }
}
