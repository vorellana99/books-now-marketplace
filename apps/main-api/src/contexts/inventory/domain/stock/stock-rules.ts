import { DomainError } from '../../../../shared-kernel/domain.errors.js';

// Unidades por carga: una carga enorme casi siempre es un cero de más
export const MAX_ADDITION = 100_000;
// Tope de lo disponible de un libro. `available` es un entero de 32 bits en la base: sin un tope, una carga muy grande
// lo desbordaría y el error saldría como un 500. Un millón de ejemplares de un título queda muy por encima de lo real
export const MAX_AVAILABLE = 1_000_000;

export interface StockLine {
  isbn: string;
  quantity: number;
}

export interface StockLevel {
  isbn: string;
  available: number;
  reserved: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// La columna es UUID: un texto cualquiera llegaría como un error crudo de la base
export function assertOrderId(orderId: string): void {
  if (!UUID.test(orderId)) {
    throw new DomainError(
      'INVALID_ORDER_ID',
      `El id de pedido no es un UUID: ${orderId}`,
    );
  }
}

// Una entrada inválida es un error de dominio, no el de la base: las líneas no pueden estar vacías, cada cantidad es un
// entero de al menos 1 y un libro no aparece dos veces
export function assertValidLines(lines: StockLine[]): void {
  if (lines.length === 0) {
    throw new DomainError('EMPTY_RESERVATION', 'No hay libros que reservar');
  }
  const seen = new Set<string>();
  for (const { isbn, quantity } of lines) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new DomainError(
        'INVALID_QUANTITY',
        `La cantidad de ${isbn} debe ser un entero de al menos 1`,
      );
    }
    if (seen.has(isbn)) {
      throw new DomainError(
        'DUPLICATE_RESERVATION_LINE',
        `El libro ${isbn} aparece más de una vez`,
      );
    }
    seen.add(isbn);
  }
}

// Una carga suma entre 1 y MAX_ADDITION unidades
export function assertValidAddition(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ADDITION) {
    throw new DomainError(
      'INVALID_QUANTITY',
      `La cantidad debe ser un entero de 1 a ${MAX_ADDITION}`,
    );
  }
}
