import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage, catalogSearchSchema } from "@/features/catalog/index.ts";

// PA-01 · Catálogo y búsqueda. La ruta solo conecta: declara la URL y qué pantalla muestra
export const Route = createFileRoute("/")({
  validateSearch: catalogSearchSchema,
  component: CatalogPage,
});
