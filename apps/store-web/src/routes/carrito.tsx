import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-05 llega en el corte F3. Mientras tanto la ruta existe, con su guardia de sesión, para probar el acceso (F2.4)
export const Route = createFileRoute("/carrito")({
  beforeLoad: requireSession,
  component: () => <EmptyState title="Estamos armando el carrito" as="h1" />,
});
