import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isApiError } from "@/shared/api/errors.ts";
import { quoteOrder } from "../api.ts";
import type { CartLine } from "../cart.store.ts";
import { timing } from "../timing.ts";

// La clave de la cotización es el contenido del carrito: ISBN y cantidad, en orden
export const quoteKey = (lines: Pick<CartLine, "isbn" | "quantity">[]) =>
  ["quote", [...lines].map((line) => `${line.isbn}:${line.quantity}`).sort()] as const;

// HU-22: el total sale del backend, nunca de la tienda. Al cambiar el carrito se vuelve a pedir, y mientras llega se conserva
// el anterior (atenuado en pantalla) sin dejar continuar. Un `404` justo después de registrarse puede ser que el cliente de
// Ventas aún no existe: se reintenta cada par de segundos, unos 8 s en total (`timing.newCustomerRetries`)
export function useQuote(lines: CartLine[], enabled: boolean) {
  return useQuery({
    queryKey: quoteKey(lines),
    queryFn: () => quoteOrder(lines.map((line) => ({ isbn: line.isbn, quantity: line.quantity }))),
    enabled: enabled && lines.length > 0,
    placeholderData: keepPreviousData,
    // La cotización siempre es del momento: no se reutiliza una vieja
    staleTime: 0,
    gcTime: 0,
    retry: (failures, error) =>
      failures < timing.newCustomerRetries && isApiError(error) && error.status === 404,
    retryDelay: () => timing.newCustomerRetryMs,
  });
}
