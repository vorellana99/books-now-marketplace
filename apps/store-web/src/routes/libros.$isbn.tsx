import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// PA-02 llega en la tarea F1.3. Mientras tanto la ruta existe para que las tarjetas del catálogo tengan adónde llevar
export const Route = createFileRoute("/libros/$isbn")({
  component: () => <EmptyState title="Estamos armando el detalle" as="h1" />,
});
