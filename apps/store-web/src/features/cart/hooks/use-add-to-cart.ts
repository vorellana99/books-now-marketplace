import { useRouter } from "@tanstack/react-router";
import { ensureSession, getSessionState } from "@/features/auth/index.ts";
import type { Book } from "@/shared/api/types.ts";
import { cartStore, MAX_PER_BOOK } from "../cart.store.ts";
import { showToast } from "../toast.store.ts";
import { useQuantityInCart } from "./use-cart.ts";

export const MAX_MESSAGE = `Máximo ${MAX_PER_BOOK} unidades por libro en cada pedido.`;

// Agregar un libro al carrito (HU-20). Sin sesión lleva a iniciar sesión con el aviso y la ruta actual como origen: al
// entrar vuelve ahí **sin** agregar el libro solo (DP-12)
export function useAddToCart(book: Book) {
  const router = useRouter();
  const quantity = useQuantityInCart(book.isbn);

  async function add(): Promise<void> {
    let { status, user } = getSessionState();
    if (status === "unknown") ({ status, user } = await ensureSession());
    if (status !== "authenticated" || !user) {
      await router.navigate({
        to: "/ingresar",
        search: { aviso: "carrito", returnTo: router.state.location.href },
      });
      return;
    }
    const userId = user.id;
    const result = cartStore.getState().add(userId, {
      isbn: book.isbn,
      title: book.title,
      author: book.author,
      unitPrice: book.price,
    });
    if (result === "currency") {
      showToast({
        tone: "warning",
        message:
          "No puedes pagar libros en soles y en dólares en un mismo pedido. Termina esa compra o quita esos libros del carrito.",
      });
    } else if (result === "max") {
      showToast({ tone: "warning", message: MAX_MESSAGE });
    } else {
      showToast({
        tone: "success",
        message: "Libro agregado",
        // Deshacer quita la unidad que se acaba de agregar
        action: {
          label: "Deshacer",
          run: () => {
            const state = cartStore.getState();
            const current =
              state.linesOf(userId).find((line) => line.isbn === book.isbn)?.quantity ?? 0;
            if (current <= 1) state.remove(userId, book.isbn);
            else state.setQuantity(userId, book.isbn, current - 1);
          },
        },
      });
    }
  }

  return { quantity, atMax: quantity >= MAX_PER_BOOK, add };
}
