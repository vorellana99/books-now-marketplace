export abstract class Notifier {
  // idempotencyKey permite al proveedor descartar un reenvío del mismo mensaje
  abstract send(
    to: string,
    message: string,
    options?: { idempotencyKey?: string },
  ): Promise<void>;
}
