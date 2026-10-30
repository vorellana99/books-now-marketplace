import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useCartCount } from "../hooks/use-cart.ts";

// El carrito en la cabecera, con su contador (solo si hay libros). Está en una región educada: al agregar, un lector de
// pantalla oye «Carrito, 3 libros». Sin sesión aparece igual y lleva a iniciar sesión (HU-20)
export function CartLink() {
  const count = useCartCount();
  return (
    <div aria-live="polite">
      <Link
        to="/carrito"
        className="relative grid size-11 place-items-center rounded-md text-foreground hover:bg-accent"
      >
        <ShoppingCart aria-hidden="true" className="size-6" />
        <span className="sr-only">
          Carrito{count > 0 ? `, ${count} ${count === 1 ? "libro" : "libros"}` : ""}
        </span>
        {count > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-0.5 right-0.5 grid min-w-5 place-items-center rounded-full bg-primary px-1 text-xs leading-5 font-semibold text-primary-foreground"
          >
            {count}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
