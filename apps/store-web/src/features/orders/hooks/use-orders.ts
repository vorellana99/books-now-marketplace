import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getOrder, listMyOrders } from "../api.ts";

// Claves de consulta: cada pedido tiene la suya, y el historial la suya
export const orderKeys = {
  all: ["orders"] as const,
  mine: ["orders", "mine"] as const,
  detail: (id: string) => ["orders", "detail", id] as const,
};

export function useOrder(id: string) {
  return useQuery({ queryKey: orderKeys.detail(id), queryFn: () => getOrder(id) });
}

// El historial se pide por cursor: cada página trae el `nextCursor` de la siguiente, o `null` en la última
export function useMyOrders() {
  return useInfiniteQuery({
    queryKey: orderKeys.mine,
    queryFn: ({ pageParam }) => listMyOrders(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
