import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/ui/button.tsx";

// "‹ Anterior · Página 1 de 5 · Siguiente ›". Los botones deshabilitados lo están de verdad. Con una sola página no se dibuja
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3">
      <Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft aria-hidden="true" />
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">
        Página {page} de {pageCount}
      </span>
      <Button variant="outline" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        Siguiente
        <ChevronRight aria-hidden="true" />
      </Button>
    </nav>
  );
}
