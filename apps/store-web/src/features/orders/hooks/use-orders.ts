import { useQuery } from "@tanstack/react-query";
import { getOrder } from "../api.ts";

// Claves de consulta: cada pedido tiene la suya
export const orderKeys = {
  all: ["orders"] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
};

export function useOrder(id: string) {
  return useQuery({ queryKey: orderKeys.detail(id), queryFn: () => getOrder(id) });
}
