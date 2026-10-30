import { createHash } from 'node:crypto';
import type { ShippingAddress } from './shipping-address.vo.js';

// Mismo cliente, mismo carrito y misma dirección → mismo hash. Fusiona las cantidades del mismo ISBN (como hace el
// agregado) y ordena con una comparación de texto simple (no `localeCompare`, que cambia según el idioma del sistema),
// así {A:1, A:2}, {A:2, A:1} y {A:3} producen el mismo hash. Los ISBN deben llegar ya normalizados, y la dirección ya
// creada con `ShippingAddress.create` (recortada, y una referencia vacía es null): así los espacios sobrantes no
// cambian la huella. Los campos de la dirección van en una lista JSON, no separados por un carácter: un texto que
// contuviera ese carácter podría confundirse con otro reparto de campos
export function hashRequest(
  customerId: string,
  items: { isbn: string; quantity: number }[],
  address: ShippingAddress,
): string {
  const merged = new Map<string, number>();
  for (const { isbn, quantity } of items) {
    merged.set(isbn, (merged.get(isbn) ?? 0) + quantity);
  }
  const lines = [...merged]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([isbn, quantity]) => `${isbn}:${quantity}`)
    .join(',');
  const shipping = JSON.stringify([
    address.recipient,
    address.phone,
    address.line1,
    address.district,
    address.province,
    address.department,
    address.reference ?? '',
  ]);
  return createHash('sha256')
    .update(`${customerId}|${lines}|${shipping}`)
    .digest('hex');
}
