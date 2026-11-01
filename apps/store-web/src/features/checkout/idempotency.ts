import type { ShippingInput } from "./schemas.ts";

export const ATTEMPT_KEY = "libroya.checkout";

type Attempt = { key: string; fingerprint: string; userId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// La huella del intento: cambia si cambia el carrito o la dirección. El ISBN y la dirección se normalizan como hace el
// backend (sin guiones, con los extremos recortados), para no generar claves nuevas por diferencias sin importancia; y,
// como en el backend, otra dirección con la misma clave es otro carrito (`IDEMPOTENCY_KEY_REUSED`)
export function fingerprint(
  lines: { isbn: string; quantity: number }[],
  address: ShippingInput,
): string {
  const books = lines
    .map((line) => [line.isbn.replaceAll("-", ""), line.quantity] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const fields = (
    ["recipient", "phone", "line1", "district", "province", "department", "reference"] as const
  ).map((name) => [name, (address[name] ?? "").trim()] as const);
  return JSON.stringify([books, fields]);
}

function readAttempt(): Attempt | undefined {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { key, fingerprint: saved, userId } = parsed as Record<string, unknown>;
    if (
      typeof key !== "string" ||
      !UUID.test(key) ||
      typeof saved !== "string" ||
      typeof userId !== "string"
    )
      return undefined;
    return { key, fingerprint: saved, userId };
  } catch {
    return undefined;
  }
}

// La clave del intento de compra (RN-21). Con la misma huella y la misma cuenta es la misma, así un reintento tras un corte
// no cobra dos veces. Se guarda en `sessionStorage`: sobrevive a recargar la página en medio del pago (DP-14) y no a
// cerrar la pestaña. `forceNew` es para `PREVIOUS_ATTEMPT_FAILED` y `IDEMPOTENCY_KEY_REUSED`
export function keyFor(userId: string, print: string, { forceNew = false } = {}): string {
  const saved = readAttempt();
  if (saved && !forceNew && saved.userId === userId && saved.fingerprint === print)
    return saved.key;
  const next: Attempt = { key: crypto.randomUUID(), fingerprint: print, userId };
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(next));
  return next.key;
}

// Se borra al recibir el `201`: el pedido ya existe y la próxima compra es otra
export function clearAttempt(): void {
  sessionStorage.removeItem(ATTEMPT_KEY);
}
