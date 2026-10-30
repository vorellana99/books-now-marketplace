import { Isbn } from '../../../../../shared-kernel/isbn.vo.js';
import type { CartItem } from '../../ports/catalog-pricing.port.js';

// "978-0-…" y "978…" son el mismo libro: se normaliza el ISBN antes de calcular la huella de la compra o de pedir
// precios. Un ISBN mal formado es INVALID_ISBN. No junta las líneas repetidas: eso lo hace el pedido
export function normalizeCart(items: CartItem[]): CartItem[] {
  return items.map((item) => ({
    isbn: Isbn.create(item.isbn).value,
    quantity: item.quantity,
  }));
}
