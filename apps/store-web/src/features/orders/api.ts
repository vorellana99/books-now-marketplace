import { api, unwrap } from "@/shared/api/client.ts";

// Tamaño de página del historial: de 20 en 20 (la API admite de 1 a 50)
export const HISTORY_PAGE_SIZE = 20;

// GET /orders/:id. Su dueño o un administrador lo ven; para otra persona es un `404`, igual que un pedido que no existe
export function getOrder(id: string) {
  return unwrap(api.GET("/orders/{id}", { params: { path: { id } } }));
}

// GET /me/orders: del más reciente al más antiguo. `cursor` es el `nextCursor` de la página anterior, tal cual (es opaco)
export function listMyOrders(cursor: string | undefined) {
  return unwrap(
    api.GET("/me/orders", {
      params: { query: { limit: HISTORY_PAGE_SIZE, ...(cursor ? { cursor } : {}) } },
    }),
  );
}
