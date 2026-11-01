import { Link } from "@tanstack/react-router";
import { useId } from "react";
import type { Book } from "@/shared/api/types.ts";
import { Button } from "@/shared/ui/button.tsx";
import { MAX_MESSAGE, useAddToCart } from "../hooks/use-add-to-cart.ts";

// El botón de PA-02: «Agregar al carrito», que tras agregar pasa a «Agregar otro (n)» y suma el enlace «Ver carrito»
export function AddToCartButton({ book }: { book: Book }) {
  const { quantity, atMax, add } = useAddToCart(book);
  const noteId = useId();
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={atMax}
          aria-describedby={atMax ? noteId : undefined}
          onClick={() => void add()}
        >
          {quantity === 0 ? "Agregar al carrito" : `Agregar otro (${quantity})`}
        </Button>
        {quantity > 0 ? (
          <Link to="/carrito" className="font-medium text-primary hover:underline">
            Ver carrito
          </Link>
        ) : null}
      </div>
      {atMax ? (
        <p id={noteId} className="text-sm text-muted-foreground">
          {MAX_MESSAGE}
        </p>
      ) : null}
    </div>
  );
}

// El botón de la tarjeta del catálogo (PA-01): corto, con el nombre del libro para quien lo oye sin ver la tarjeta
export function AddToCartCardButton({ book }: { book: Book }) {
  const { quantity, atMax, add } = useAddToCart(book);
  const noteId = useId();
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        disabled={atMax}
        aria-describedby={atMax ? noteId : undefined}
        aria-label={
          quantity === 0
            ? `Agregar ${book.title} al carrito`
            : `Agregar otro ejemplar de ${book.title} (${quantity} en el carrito)`
        }
        onClick={() => void add()}
      >
        {quantity === 0 ? "Agregar" : `Agregar otro (${quantity})`}
      </Button>
      {atMax ? (
        <p id={noteId} className="text-xs text-muted-foreground">
          Máximo 10 por pedido.
        </p>
      ) : null}
    </div>
  );
}
