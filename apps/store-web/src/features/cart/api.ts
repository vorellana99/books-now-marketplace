import { api, unwrap } from "@/shared/api/client.ts";

// El carrito consulta cada libro con su propia llamada (no usa `features/catalog`: el catálogo ya importa el carrito, y
// al revés habría un ciclo entre funcionalidades)
export function fetchBook(isbn: string) {
  return unwrap(api.GET("/books/{isbn}", { params: { path: { isbn } } }));
}

// El total antes de pagar (RN-08): el backend lo calcula con las mismas reglas del cobro. La tienda solo manda ISBN y
// cantidad (RN-23): ni precios, ni el cliente (es el del token)
export function quoteOrder(items: { isbn: string; quantity: number }[]) {
  return unwrap(api.POST("/orders/quote", { body: { items } }));
}
