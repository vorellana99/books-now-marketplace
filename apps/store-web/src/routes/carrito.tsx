import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { CartPage } from "@/features/cart/index.ts";

// PA-05 · Carrito (con sesión). La ruta solo conecta: declara la URL, su acceso y qué pantalla muestra
export const Route = createFileRoute("/carrito")({
  beforeLoad: requireSession,
  component: CartPage,
});
