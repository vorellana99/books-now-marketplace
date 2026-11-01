import { createFileRoute } from "@tanstack/react-router";
import { BookDetailPage } from "@/features/catalog/index.ts";

// PA-02 · Detalle del libro. La ruta solo conecta: declara la URL y qué pantalla muestra
export const Route = createFileRoute("/libros/$isbn")({
  component: BookDetailPage,
});
