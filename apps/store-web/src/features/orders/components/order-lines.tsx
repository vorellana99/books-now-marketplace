import type { OrderLine } from "@/shared/api/types.ts";
import { formatMoney } from "@/shared/lib/money.ts";

// Los libros de un pedido con el precio **de la compra** (RN-01) y la cantidad, tal como los devuelve la API: nada se calcula
export function OrderLines({ lines }: { lines: OrderLine[] }) {
  return (
    <ul
      aria-label="Libros del pedido"
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card"
    >
      {lines.map((line) => (
        <li key={line.isbn} className="flex items-baseline justify-between gap-3 p-4">
          <span className="font-medium">{line.title}</span>
          <span className="money text-muted-foreground">
            {line.quantity} × {formatMoney(line.unitPrice)}
          </span>
        </li>
      ))}
    </ul>
  );
}
