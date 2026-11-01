import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { CheckoutPage } from "@/features/checkout/index.ts";

// PA-06 · Dirección y pago (con sesión). La ruta solo conecta: declara la URL, su acceso y qué pantalla muestra
export const Route = createFileRoute("/compra")({
  beforeLoad: requireSession,
  component: CheckoutPage,
});
