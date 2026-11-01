import { useStore } from "zustand";
import { useSession } from "@/features/auth/index.ts";
import { cartStore, type CartLine } from "../cart.store.ts";

const EMPTY: CartLine[] = [];

// El carrito de la persona con sesión (vacío sin sesión)
export function useCartLines(): CartLine[] {
  const userId = useSession().user?.id;
  const byUser = useStore(cartStore, (state) => state.byUser);
  return (userId ? byUser[userId] : undefined) ?? EMPTY;
}

// Unidades en el carrito, para el contador de la cabecera
export function useCartCount(): number {
  return useCartLines().reduce((sum, line) => sum + line.quantity, 0);
}

export function useQuantityInCart(isbn: string): number {
  return useCartLines().find((line) => line.isbn === isbn)?.quantity ?? 0;
}
