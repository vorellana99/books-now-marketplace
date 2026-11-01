import type { Order } from "@/shared/api/types.ts";

// El bloque de envío solo existe si el pedido trae la dirección (es `null` en uno anterior a ella, DP-15)
export function ShippingBlock({ address }: { address: NonNullable<Order["shippingAddress"]> }) {
  return (
    <section aria-labelledby="envio" className="flex flex-col gap-1">
      <h2 id="envio" className="text-lg">
        Envío
      </h2>
      <p>
        {address.recipient} · {address.phone}
      </p>
      <p className="text-muted-foreground">
        {address.line1}, {address.district}, {address.province}, {address.department}
        {address.reference ? ` (${address.reference})` : ""}
      </p>
    </section>
  );
}
