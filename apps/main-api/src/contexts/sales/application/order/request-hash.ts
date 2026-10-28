import { createHash } from 'node:crypto';

// Mismo cliente y mismo carrito → mismo hash. Fusiona las cantidades del mismo ISBN (como hace el agregado) y ordena
// con una comparación de texto simple (no `localeCompare`, que cambia según el idioma del sistema), así
// {A:1, A:2}, {A:2, A:1} y {A:3} producen el mismo hash. Los ISBN deben llegar ya normalizados
export function hashRequest(
  customerId: string,
  items: { isbn: string; quantity: number }[],
): string {
  const merged = new Map<string, number>();
  for (const { isbn, quantity } of items) {
    merged.set(isbn, (merged.get(isbn) ?? 0) + quantity);
  }
  const lines = [...merged]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([isbn, quantity]) => `${isbn}:${quantity}`)
    .join(',');
  return createHash('sha256').update(`${customerId}|${lines}`).digest('hex');
}
