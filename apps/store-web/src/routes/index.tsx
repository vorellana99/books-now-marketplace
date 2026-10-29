import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { EmptyState } from "@/shared/ui/state-panel.tsx";

// El esquema de la búsqueda se mueve a `features/catalog` en el corte F1. La búsqueda y la página viven en la
// URL; un valor inválido se descarta en lugar de romper la pantalla. Ambos son opcionales para que un enlace a `/`
// no tenga que indicarlos; la página por defecto (1) la aplica la pantalla
const searchSchema = z.object({
  q: z.string().trim().min(1).optional().catch(undefined),
  page: z.number().int().min(1).optional().catch(undefined),
});

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  component: CatalogPlaceholder,
});

// PA-01 llega en el corte F1. Mientras tanto, la ruta existe para que el buscador de la cabecera tenga adónde ir
function CatalogPlaceholder() {
  return (
    <>
      <title>Libros · LibroYa</title>
      <h1 className="sr-only">Libros</h1>
      <EmptyState
        title="Estamos armando el catálogo"
        description="Muy pronto podrás buscar y comprar tus libros aquí."
      />
    </>
  );
}
