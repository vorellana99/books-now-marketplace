import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { formatMoney } from "@/shared/lib/money.ts";
import { OrderGate } from "../components/order-gate.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderNumber } from "../components/order-number.tsx";
import { ShippingBlock } from "../components/shipping-block.tsx";
import { orderNumber } from "../order-number.ts";

// Solo `PLACED` existe hoy (producto 06: «Realizado»)
const STATUS = { PLACED: "Realizado" } as const;

// PA-09 · Detalle del pedido (HU-41). Los precios son los de la compra (RN-01), tal cual los devuelve la API: nada se calcula
export function OrderDetailPage() {
  const { id } = useParams({ from: "/pedidos/$id/" });
  return (
    <OrderGate id={id}>
      {(order) => (
        <>
          <title>{`Pedido ${orderNumber(order.id)} · LibroYa`}</title>
          <div className="mx-auto flex max-w-[720px] flex-col gap-6">
            <Link
              to="/pedidos"
              className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-primary hover:underline"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
              Volver a mis pedidos
            </Link>
            <header className="flex flex-col gap-1">
              <h1>{`Pedido ${orderNumber(order.id)}`}</h1>
              <p className="flex flex-wrap items-center gap-x-3 text-muted-foreground">
                <span>{STATUS[order.status]}</span>
                <OrderNumber id={order.id} showNumber={false} />
              </p>
            </header>
            <OrderLines lines={order.lines} />
            <p className="flex items-baseline justify-between gap-3 text-lg font-semibold">
              <span>Total cobrado</span>
              <span className="money text-xl">{formatMoney(order.charged)}</span>
            </p>
            {order.shippingAddress ? <ShippingBlock address={order.shippingAddress} /> : null}
          </div>
        </>
      )}
    </OrderGate>
  );
}
