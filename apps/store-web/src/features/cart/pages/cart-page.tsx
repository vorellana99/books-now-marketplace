import { Link } from "@tanstack/react-router";
import { useStore } from "zustand";
import { useSession } from "@/features/auth/index.ts";
import { Alert } from "@/shared/ui/alert.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { isApiError } from "@/shared/api/errors.ts";
import { EmptyState } from "@/shared/ui/state-panel.tsx";
import { cartStore } from "../cart.store.ts";
import { CartLine } from "../components/cart-line.tsx";
import { OrderSummary } from "../components/order-summary.tsx";
import { useQuote } from "../hooks/use-quote.ts";
import { useCartRevalidation } from "../hooks/use-cart-revalidation.ts";
import { useCartLines } from "../hooks/use-cart.ts";
import { showToast } from "../toast.store.ts";

// PA-05 · Carrito (HU-21, HU-22). Los totales llegan con la cotización en F4: aquí las líneas y la revalidación
export function CartPage() {
  const userId = useSession().user?.id;
  const lines = useCartLines();
  const revalidation = useCartRevalidation();
  // Se cotiza cuando ya se sabe qué libros siguen disponibles: con uno inactivo el backend respondería `404`
  const quote = useQuote(lines, !revalidation.checking && !revalidation.blocked);
  const quoted = quote.data;
  const subtotals = new Map(quoted?.lines.map((line) => [line.isbn, line.subtotal]));
  const quoteBusy = quote.isFetching;
  // Solo se puede continuar con un total vigente: cotizado, sin una nueva cotización en camino y sin bloqueos
  const canContinue =
    quoted !== undefined &&
    !quoteBusy &&
    !quote.isError &&
    !revalidation.blocked &&
    !revalidation.checking;
  const actions = useStore(cartStore, (state) => state);

  const remove = (isbn: string) => {
    if (!userId) return;
    const removed = actions.remove(userId, isbn);
    if (!removed) return;
    showToast({
      tone: "success",
      message: "Quitado del carrito",
      action: {
        label: "Deshacer",
        run: () => cartStore.getState().restore(userId, removed.line, removed.index),
      },
    });
  };

  return (
    <>
      <title>Carrito · LibroYa</title>
      <div className="flex flex-col gap-4">
        <h1>Tu carrito</h1>
        {lines.length === 0 ? (
          <EmptyState
            title="Tu carrito está vacío."
            description="Cuando agregues libros, aparecerán aquí."
            action={
              <Button asChild>
                <Link to="/">Ver libros</Link>
              </Button>
            }
          />
        ) : (
          <>
            {revalidation.checking ? (
              <p aria-live="polite" className="text-sm text-muted-foreground">
                Comprobando precios…
              </p>
            ) : null}
            {revalidation.changedCount > 0 ? (
              <Alert variant="info">
                Actualizamos el precio de {revalidation.changedCount}{" "}
                {revalidation.changedCount === 1 ? "libro" : "libros"} de tu carrito.
              </Alert>
            ) : null}
            {revalidation.unavailable.length > 0 ? (
              <Alert variant="warning">Quita los libros no disponibles para continuar.</Alert>
            ) : null}
            {revalidation.mixedCurrency ? (
              <Alert variant="warning">
                Tu carrito tiene libros en soles y en dólares. Quita los que no quieras pagar: un
                pedido se paga en una sola moneda.
              </Alert>
            ) : null}
            <ul className="flex flex-col gap-3">
              {lines.map((line) => (
                <CartLine
                  key={line.isbn}
                  line={line}
                  check={revalidation.checks[line.isbn]}
                  subtotal={subtotals.get(line.isbn)}
                  onQuantity={(quantity) =>
                    userId && actions.setQuantity(userId, line.isbn, quantity)
                  }
                  onRemove={() => remove(line.isbn)}
                />
              ))}
            </ul>
            {revalidation.blocked ? (
              <p className="text-sm text-muted-foreground">
                Quita los libros no disponibles para ver tu total.
              </p>
            ) : quote.isError && !quoted ? (
              <Alert
                variant="error"
                action={
                  <Button variant="outline" onClick={() => void quote.refetch()}>
                    Reintentar
                  </Button>
                }
              >
                <p>No pudimos calcular tu total.</p>
                {isApiError(quote.error) && quote.error.requestId ? (
                  <p className="mt-1 text-xs">
                    Código de soporte:{" "}
                    <span className="money select-all">{quote.error.requestId}</span>
                  </p>
                ) : null}
              </Alert>
            ) : quoted ? (
              <OrderSummary quote={quoted} busy={quoteBusy} />
            ) : null}
            {canContinue ? (
              <Button asChild className="w-full md:w-auto md:self-end">
                <Link to="/compra">Continuar con la compra</Link>
              </Button>
            ) : (
              <Button disabled aria-disabled="true" className="w-full md:w-auto md:self-end">
                Continuar con la compra
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}
