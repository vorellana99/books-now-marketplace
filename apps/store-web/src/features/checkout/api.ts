import { api, unwrap } from "@/shared/api/client.ts";
import type { PlaceOrderBody } from "@/shared/api/types.ts";
import type { ShippingAddress } from "./schemas.ts";

export type PlaceOrderInput = {
  key: string;
  items: { isbn: string; quantity: number }[];
  address: ShippingAddress;
  cardToken: string;
};

// POST /orders. El cliente es el del token: el cuerpo NO lleva `customerId` (la API lo rechazaría con `400`), ni precios
// ni totales (RN-23): solo ISBN y cantidad, la dirección y el código de la tarjeta. La clave viaja en `Idempotency-Key`
export function placeOrder({ key, items, address, cardToken }: PlaceOrderInput) {
  const body = { cardToken, items, shippingAddress: address } as PlaceOrderBody;
  return unwrap(api.POST("/orders", { params: { header: { "Idempotency-Key": key } }, body }));
}
