import { Link } from "@tanstack/react-router";
import { useStore } from "zustand";
import { useSession } from "@/features/auth/index.ts";
import { Button } from "@/shared/ui/button.tsx";
import { EmptyState } from "@/shared/ui/state-panel.tsx";
import { cartStore } from "../cart.store.ts";
import { CartLine } from "../components/cart-line.tsx";
import { useCartLines } from "../hooks/use-cart.ts";
import { showToast } from "../toast.store.ts";

// PA-05 · Carrito (HU-21, HU-22). Los totales llegan con la cotización en F4: aquí solo las líneas
export function CartPage() {
  const userId = useSession().user?.id;
  const lines = useCartLines();
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
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <CartLine
                key={line.isbn}
                line={line}
                onQuantity={(quantity) =>
                  userId && actions.setQuantity(userId, line.isbn, quantity)
                }
                onRemove={() => remove(line.isbn)}
              />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
