// Toda transacción que toca `stock_items` bloquea las filas en este orden (reservar y liberar).
// Si dos pedidos con los libros {A, B} y {B, A} operan a la vez, ambos bloquean primero A y luego B,
// y no se produce un interbloqueo. Cualquier operación nueva sobre el stock debe usar este mismo orden.
// Es una comparación de texto simple, no `localeCompare`, para que no dependa del idioma del sistema.
export function sortByIsbn<T extends { isbn: string }>(lines: T[]): T[] {
  return [...lines].sort((a, b) =>
    a.isbn < b.isbn ? -1 : a.isbn > b.isbn ? 1 : 0,
  );
}
