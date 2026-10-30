import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-07 llega en la tarea F4.5. Mientras tanto la ruta existe, con su guardia de sesión, para que el pago tenga adónde ir
export const Route = createFileRoute("/pedidos/$id/gracias")({
  beforeLoad: requireSession,
  component: () => <EmptyState title="Estamos armando la confirmación" as="h1" />,
});
