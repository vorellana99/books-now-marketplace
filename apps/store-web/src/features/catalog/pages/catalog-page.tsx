import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useRef } from "react";
import { SearchBox } from "@/app/search-box.tsx";
import { isApiError } from "@/shared/api/errors.ts";
import { Button } from "@/shared/ui/button.tsx";
import { Pagination } from "@/shared/ui/pagination.tsx";
import { Skeleton } from "@/shared/ui/skeleton.tsx";
import { EmptyState, ErrorState } from "@/shared/ui/state-panel.tsx";
import { PAGE_SIZE } from "../api.ts";
import { BookCard } from "../components/book-card.tsx";
import { useBookSearch } from "../hooks/use-books.ts";

const LIST_CLASS = "grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

// PA-01 · Catálogo y búsqueda (HU-10). La búsqueda y la página vienen de la URL
export function CatalogPage() {
  const search = useSearch({ from: "/" });
  const navigate = useNavigate({ from: "/" });
  const q = search.q;
  const page = search.page ?? 1;
  const query = useBookSearch({ q, page });
  const headingRef = useRef<HTMLHeadingElement>(null);

  const goTo = (next: number) =>
    // Al cambiar de página el foco vuelve al principio de la lista, para que el teclado no se quede en el botón
    void navigate({ search: (prev) => ({ ...prev, page: next }) }).then(() =>
      headingRef.current?.focus(),
    );
  const clear = () => void navigate({ to: "/", search: { page: 1 } });
  const firstPage = { page: 1, ...(q ? { q } : {}) };

  const total = query.data?.total ?? 0;
  const items = query.data?.items ?? [];
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <title>{q ? `Resultados para «${q}» · LibroYa` : "Libros · LibroYa"}</title>
      <div className="flex flex-col gap-4" aria-busy={query.isPending}>
        <h1 ref={headingRef} tabIndex={-1} className="outline-none">
          Libros
        </h1>
        {/* En escritorio la búsqueda es la de la cabecera: es el mismo campo */}
        <SearchBox id="buscar-pagina" showSubmit className="md:hidden" />

        {query.isPending ? (
          <>
            <p role="status" className="sr-only">
              Cargando libros…
            </p>
            <ul className={LIST_CLASS} aria-hidden="true">
              {Array.from({ length: 6 }, (_, n) => (
                <li key={n} className="flex gap-3 rounded-lg border border-border bg-card p-3">
                  <Skeleton className="h-[84px] w-14 shrink-0" />
                  <div className="flex flex-1 flex-col gap-2.5">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-[18px] w-[30%]" />
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : query.isError ? (
          <ErrorState
            supportCode={isApiError(query.error) ? query.error.requestId : undefined}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          q ? (
            <EmptyState
              title="Sin resultados"
              description={`No encontramos libros para «${q}». Prueba con otro título o autor.`}
              action={
                <Button variant="outline" onClick={clear}>
                  Limpiar búsqueda
                </Button>
              }
            />
          ) : total > 0 ? (
            <EmptyState
              title="Esta página no existe."
              action={
                <Button asChild variant="outline">
                  <Link to="/" search={firstPage}>
                    Ir a la primera página
                  </Link>
                </Button>
              }
            />
          ) : (
            <EmptyState title="Todavía no hay libros en el catálogo." />
          )
        ) : (
          <>
            {q ? (
              <div className="flex items-center justify-between gap-2">
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {total} {total === 1 ? "resultado" : "resultados"} para «{q}»
                </p>
                <Button variant="ghost" onClick={clear}>
                  Limpiar búsqueda
                </Button>
              </div>
            ) : null}
            <ul className={LIST_CLASS}>
              {items.map((book) => (
                <li key={book.isbn}>
                  <BookCard book={book} />
                </li>
              ))}
            </ul>
            <Pagination page={page} pageCount={pageCount} onChange={goTo} />
          </>
        )}
      </div>
    </>
  );
}
