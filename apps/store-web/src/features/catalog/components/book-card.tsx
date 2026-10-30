import { Link } from "@tanstack/react-router";
import type { Book } from "@/shared/api/types.ts";
import { AddToCartCardButton } from "@/features/cart/index.ts";
import { BookCover } from "@/shared/ui/book-cover.tsx";
import { Price } from "@/shared/ui/price.tsx";

// Tarjeta de un libro en el catálogo: en móvil una fila (portada pequeña a la izquierda), desde `sm` una tarjeta vertical.
// Todo el título es un enlace al detalle; el botón «Agregar» es independiente (no navega)
export function BookCard({ book }: { book: Book }) {
  return (
    <article className="flex h-full gap-3 rounded-lg border border-border bg-card p-3 sm:flex-col">
      {/* Una sola portada que crece desde `sm`: pequeña en la fila del móvil, mediana en la tarjeta vertical */}
      <BookCover
        isbn={book.isbn}
        title={book.title}
        author={book.author}
        size="sm"
        className="sm:w-24 sm:p-2 sm:text-sm"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-base leading-snug font-semibold">
          <Link to="/libros/$isbn" params={{ isbn: book.isbn }} className="hover:text-primary">
            {book.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">{book.author}</p>
        <Price money={book.price} className="mt-auto pt-1" />
        <AddToCartCardButton book={book} />
      </div>
    </article>
  );
}
