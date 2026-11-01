import { cn } from "@/shared/lib/cn.ts";
import { formatMoney } from "@/shared/lib/money.ts";
import type { Quote } from "@/shared/api/types.ts";

// La regla de envío (docs/product/07-contenido-y-mensajes.md): texto fijo de la tienda
export const SHIPPING_RULE =
  "Envío S/ 10.00. Gratis desde S/ 150.00 (3.00 USD y gratis desde 40.00 USD en pedidos en dólares).";

const isZero = (amount: string) => /^0+\.00$/.test(amount);

// El resumen del pedido: subtotal, descuento (solo si lo hay), envío («Gratis» o su costo) y total a pagar. Todos los montos
// son los de la cotización, ya redondeados: la tienda no suma nada (RN-08). `busy` atenúa el total anterior mientras llega el
// nuevo
export function OrderSummary({ quote, busy }: { quote: Quote; busy: boolean }) {
  return (
    <section
      aria-label="Resumen del pedido"
      aria-busy={busy}
      className={cn(
        "flex flex-col gap-2 rounded-lg border border-border bg-card p-4",
        busy && "opacity-60",
      )}
    >
      <dl className="flex flex-col gap-1.5">
        <Row label="Subtotal" value={formatMoney(quote.subtotal)} />
        {isZero(quote.discount.amount) ? null : (
          <Row label="Descuento" value={`−${formatMoney(quote.discount)}`} />
        )}
        <Row
          label="Envío"
          value={isZero(quote.shipping.amount) ? "Gratis" : formatMoney(quote.shipping)}
        />
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-border pt-2">
          <dt className="text-lg font-semibold">Total a pagar</dt>
          <dd className="money text-xl font-semibold">{formatMoney(quote.total)}</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">{SHIPPING_RULE}</p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="money">{value}</dd>
    </div>
  );
}
