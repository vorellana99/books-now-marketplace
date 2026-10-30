import { Link } from "@tanstack/react-router";
import { useStore } from "zustand";
import { useSession } from "@/features/auth/index.ts";
import { Alert } from "@/shared/ui/alert.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { EmptyState } from "@/shared/ui/state-panel.tsx";
import { cartStore } from "../cart.store.ts";
import { CartLine } from "../components/cart-line.tsx";
import { useCartRevalidation } from "../hooks/use-cart-revalidation.ts";
import { useCartLines } from "../hooks/use-cart.ts";
import { showToast } from "../toast.store.ts";

// PA-05 · Carrito (HU-21, HU-22). Los totales llegan con la cotización en F4: aquí las líneas y la revalidación
export function CartPage() {
  const userId = useSession().user?.id;
  const lines = useCartLines();
  const revalidation = useCartRevalidation();
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
                  onQuantity={(quantity) =>
                    userId && actions.setQuantity(userId, line.isbn, quantity)
                  }
                  onRemove={() => remove(line.isbn)}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}
