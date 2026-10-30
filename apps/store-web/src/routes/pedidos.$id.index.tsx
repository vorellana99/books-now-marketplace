import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-09 llega en la tarea F5.2. Mientras tanto la ruta existe, con su guardia de sesión, para que la lista tenga adónde llevar
export const Route = createFileRoute("/pedidos/$id/")({
  beforeLoad: requireSession,
  component: () => <EmptyState title="Estamos armando el detalle del pedido" as="h1" />,
});
