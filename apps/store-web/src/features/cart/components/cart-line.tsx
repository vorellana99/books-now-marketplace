import { Link } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { MAX_PER_BOOK, type CartLine as Line } from "../cart.store.ts";
import type { LineCheck } from "../hooks/use-cart-revalidation.ts";
import { formatMoney } from "@/shared/lib/money.ts";
import { Alert } from "@/shared/ui/alert.tsx";
import { BookCover } from "@/shared/ui/book-cover.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { Price } from "@/shared/ui/price.tsx";

const QUANTITIES = Array.from({ length: MAX_PER_BOOK }, (_, n) => n + 1);

// Una línea de PA-05: portada pequeña, título (enlace), autor, precio unitario, selector de cantidad (1 a 10) y «Quitar».
// El selector es un `<select>` nativo (accesible y rápido en móvil) y los dos controles nombran el libro
export function CartLine({
  line,
  check,
  onQuantity,
  onRemove,
}: {
  line: Line;
  check?: LineCheck | undefined;
  onQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  const selectId = `cantidad-${line.isbn}`;
  const unavailable = check?.status === "unavailable";
  return (
    <li
      className={`flex gap-3 rounded-lg border border-border bg-card p-3 ${unavailable ? "opacity-70" : ""}`}
    >
      {/* `self-start`: si no, la portada se estira a la altura de la fila y pierde su proporción */}
      <BookCover
        isbn={line.isbn}
        title={line.title}
        author={line.author}
        size="sm"
        className="self-start"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-base leading-snug font-semibold">
            <Link to="/libros/$isbn" params={{ isbn: line.isbn }} className="hover:text-primary">
              {line.title}
            </Link>
          </h3>
          <p className="text-sm text-muted-foreground">{line.author}</p>
          <Price money={line.unitPrice} />
        </div>
        {unavailable ? (
          <div className="flex flex-col items-start gap-2">
            <span className="rounded-md bg-muted px-2 py-1 text-sm font-semibold">
              No disponible
            </span>
            <Alert variant="warning">
              Este libro ya no está disponible. Quítalo para continuar.
            </Alert>
          </div>
        ) : null}
        {check?.status === "changed" ? (
          <Alert variant="warning">
            El precio de este libro cambió. Ahora cuesta {formatMoney(check.to)} (antes{" "}
            {formatMoney(check.from)}).
          </Alert>
        ) : null}
        {check?.status === "unknown" ? (
          <p className="text-sm text-muted-foreground">No pudimos comprobar este libro ahora.</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {unavailable ? null : (
            <div className="flex items-center gap-2">
              <label htmlFor={selectId} className="sr-only">
                Cantidad de {line.title}
              </label>
              <select
                id={selectId}
                value={line.quantity}
                onChange={(event) => onQuantity(Number(event.target.value))}
                className="h-11 rounded-md border border-input bg-card px-3 text-base"
              >
                {QUANTITIES.map((quantity) => (
                  <option key={quantity} value={quantity}>
                    {quantity}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            variant="ghost"
            className="text-foreground"
            onClick={onRemove}
            aria-label={`Quitar ${line.title}`}
          >
            <Trash2 aria-hidden="true" />
            Quitar
          </Button>
        </div>
      </div>
    </li>
  );
}
