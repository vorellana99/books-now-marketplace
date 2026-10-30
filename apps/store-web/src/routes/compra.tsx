import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-06 llega en la tarea F4.2. Mientras tanto la ruta existe, con su guardia de sesión, para que el carrito pueda continuar
export const Route = createFileRoute("/compra")({
  beforeLoad: requireSession,
  component: () => <EmptyState title="Estamos armando el pago" as="h1" />,
});
