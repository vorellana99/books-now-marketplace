import { api, unwrap } from "@/shared/api/client.ts";

// GET /orders/:id. Su dueño o un administrador lo ven; para otra persona es un `404`, igual que un pedido que no existe
export function getOrder(id: string) {
  return unwrap(api.GET("/orders/{id}", { params: { path: { id } } }));
}
