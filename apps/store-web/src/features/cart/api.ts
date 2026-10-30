import { api, unwrap } from "@/shared/api/client.ts";

// El carrito consulta cada libro con su propia llamada (no usa `features/catalog`: el catálogo ya importa el carrito, y
// al revés habría un ciclo entre funcionalidades)
export function fetchBook(isbn: string) {
  return unwrap(api.GET("/books/{isbn}", { params: { path: { isbn } } }));
}
