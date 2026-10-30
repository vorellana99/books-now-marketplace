import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-03 llega en la tarea F2.3. Mientras tanto la ruta existe para que el enlace de PA-04 compile
export const Route = createFileRoute("/registro")({
  component: () => <EmptyState title="Estamos armando el registro" as="h1" />,
});
