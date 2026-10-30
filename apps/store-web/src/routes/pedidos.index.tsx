import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-08 llega en el corte F5. Mientras tanto la ruta existe, con su guardia de sesión, para que la confirmación tenga adónde
// llevar con «Ver mis pedidos»
export const Route = createFileRoute("/pedidos/")({
  beforeLoad: requireSession,
  component: () => <EmptyState title="Estamos armando tus pedidos" as="h1" />,
});
