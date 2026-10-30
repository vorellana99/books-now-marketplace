import { useQueries } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/features/auth/index.ts";
import { isApiError } from "@/shared/api/errors.ts";
import type { Money } from "@/shared/api/types.ts";
import { fetchBook } from "../api.ts";
import { cartStore } from "../cart.store.ts";
import { useCartLines } from "./use-cart.ts";

// Qué pasó con cada línea al volver a consultar su libro
export type LineCheck =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "changed"; from: Money; to: Money }
  | { status: "unavailable" }
  // No se pudo comprobar (red o 5xx): no se marca ni se bloquea
  | { status: "unknown" };

// Un libro que no existe o está inactivo (`404`) o con un ISBN que ya no es válido (`422`) se ve igual: no disponible
const isUnavailable = (error: unknown) =>
  isApiError(error) &&
  (error.status === 404 ||
    error.status === 422 ||
    error.errorCode === "NOT_FOUND" ||
    error.errorCode === "INVALID_ISBN");

const samePrice = (a: Money, b: Money) => a.amount === b.amount && a.currency === b.currency;

// HU-22: al abrir el carrito se vuelve a consultar cada libro (siempre, aunque la consulta anterior sea reciente). Un precio
// cambiado se actualiza y se avisa; un libro inactivo se marca «no disponible» y no deja continuar hasta quitarlo. El
// carrito guarda el libro «tal como se vio al agregarlo», así que esto es lo que lo mantiene al día
export function useCartRevalidation() {
  const userId = useSession().user?.id;
  const lines = useCartLines();
  const results = useQueries({
    queries: lines.map((line) => ({
      queryKey: ["cart", "book", line.isbn] as const,
      queryFn: () => fetchBook(line.isbn),
      staleTime: 0,
      refetchOnMount: "always" as const,
    })),
  });
  const [changes, setChanges] = useState<Record<string, { from: Money; to: Money }>>({});

  // Se aplica lo que llegó: precio, título y autor vigentes
  const signature = results.map((result) => result.dataUpdatedAt).join(",");
  useEffect(() => {
    if (!userId) return;
    lines.forEach((line, index) => {
      const book = results[index]?.data;
      if (!book) return;
      const priceChanged = !samePrice(line.unitPrice, book.price);
      const textChanged = line.title !== book.title || line.author !== book.author;
      if (!priceChanged && !textChanged) return;
      cartStore.getState().updateBook(userId, {
        isbn: line.isbn,
        title: book.title,
        author: book.author,
        unitPrice: book.price,
      });
      if (priceChanged) {
        setChanges((previous) => ({
          ...previous,
          [line.isbn]: previous[line.isbn] ?? { from: line.unitPrice, to: book.price },
        }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega un resultado nuevo
  }, [signature, userId]);

  const checks = useMemo(() => {
    const byIsbn: Record<string, LineCheck> = {};
    lines.forEach((line, index) => {
      const result = results[index];
      const change = changes[line.isbn];
      if (result?.isError) {
        byIsbn[line.isbn] = isUnavailable(result.error)
          ? { status: "unavailable" }
          : { status: "unknown" };
      } else if (!result || result.isPending) {
        byIsbn[line.isbn] = { status: "checking" };
      } else if (change) {
        byIsbn[line.isbn] = { status: "changed", ...change };
      } else {
        byIsbn[line.isbn] = { status: "ok" };
      }
    });
    return byIsbn;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los resultados cambian con `signature`
  }, [lines, changes, signature, results.map((result) => result.status).join(",")]);

  const statuses = Object.values(checks);
  const unavailable = lines
    .filter((line) => checks[line.isbn]?.status === "unavailable")
    .map((line) => line.isbn);
  // La moneda vigente: la que acaba de llegar del libro, aunque el carrito guardado todavía no se haya actualizado. Si no,
  // habría un instante en que se cotizaría un carrito con dos monedas
  const mixedCurrency =
    new Set(
      lines.map((line, index) => results[index]?.data?.price.currency ?? line.unitPrice.currency),
    ).size > 1;
  return {
    checks,
    // Todavía se está consultando algún libro (la primera vez o al abrir otra vez)
    checking: results.some((result) => result.isFetching),
    changedCount: statuses.filter((check) => check.status === "changed").length,
    unavailable,
    mixedCurrency,
    // No se puede continuar a pagar mientras haya libros no disponibles o monedas mezcladas
    blocked: unavailable.length > 0 || mixedCurrency,
  };
}
