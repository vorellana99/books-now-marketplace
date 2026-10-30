import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { AddToCartButton } from "@/features/cart/index.ts";
import { isApiError } from "@/shared/api/errors.ts";
import { BookCover } from "@/shared/ui/book-cover.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { Price } from "@/shared/ui/price.tsx";
import { Skeleton } from "@/shared/ui/skeleton.tsx";
import { ErrorState, NotFoundState } from "@/shared/ui/state-panel.tsx";
import { useBook } from "../hooks/use-books.ts";

// Un libro que no existe, está inactivo (`404 NOT_FOUND`) o con un ISBN mal formado (`422 INVALID_ISBN`) se ve igual:
// "no disponible". Ninguno de los dos es un error de la persona ni de la tienda
const isUnavailable = (error: unknown) =>
  isApiError(error) &&
  (error.errorCode === "NOT_FOUND" ||
    error.errorCode === "INVALID_ISBN" ||
    error.status === 404 ||
    error.status === 422);

const BackLink = () => (
  <Link
    to="/"
    className="inline-flex min-h-11 items-center gap-1 font-medium text-primary hover:underline"
  >
    <ChevronLeft aria-hidden="true" className="size-5" />
    Volver a los libros
  </Link>
);

// PA-02 · Detalle del libro (HU-11)
export function BookDetailPage() {
  const { isbn } = useParams({ from: "/libros/$isbn" });
  const query = useBook(isbn);

  if (query.isPending) {
    return (
      <>
        <title>Libro · LibroYa</title>
        <p role="status" className="sr-only">
          Cargando el libro…
        </p>
        <div aria-hidden="true" className="flex flex-col gap-6 md:flex-row">
          <Skeleton className="aspect-[2/3] w-40 shrink-0" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-5 w-1/4" />
            <Skeleton className="h-8 w-1/5" />
          </div>
        </div>
      </>
    );
  }

  if (query.isError) {
    if (isUnavailable(query.error)) {
      return (
        <>
          <title>Libro no disponible · LibroYa</title>
          <NotFoundState
            as="h1"
            title="Este libro no está disponible."
            action={
              <Button asChild variant="outline">
                <Link to="/">Ver los libros</Link>
              </Button>
            }
          />
        </>
      );
    }
    return (
      <ErrorState
        as="h1"
        supportCode={isApiError(query.error) ? query.error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const book = query.data;
  return (
    <>
      <title>{`${book.title} · LibroYa`}</title>
      <div className="flex flex-col gap-4 pb-24 md:pb-0">
        <BackLink />
        <div className="flex flex-col gap-6 md:flex-row md:gap-10">
          <BookCover
            isbn={book.isbn}
            title={book.title}
            author={book.author}
            size="lg"
            className="mx-auto md:mx-0"
          />
          <div className="flex flex-1 flex-col gap-3">
            <h1>{book.title}</h1>
            <p className="text-lg text-muted-foreground">{book.author}</p>
            <p className="text-sm text-muted-foreground">
              ISBN <span className="money text-foreground">{book.isbn}</span>
            </p>
            {/* En móvil el precio y el botón van en una barra fija abajo; en escritorio, junto a los datos */}
            <div className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-4 border-t border-border bg-card p-3 md:static md:z-auto md:justify-start md:border-0 md:bg-transparent md:p-0 md:pt-2">
              <Price money={book.price} size="large" />
              <AddToCartButton book={book} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
