import { Link, useParams } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { formatMoney } from "@/shared/lib/money.ts";
import { Button } from "@/shared/ui/button.tsx";
import { OrderGate } from "../components/order-gate.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderNumber } from "../components/order-number.tsx";
import { ShippingBlock } from "../components/shipping-block.tsx";

// PA-07 · Confirmación (HU-34). Se lee el pedido de la API, nunca de la memoria: recargar muestra lo mismo, y el total es el
// que se cobró de verdad (RN-08), no el que se cotizó
export function OrderConfirmationPage() {
  const { id } = useParams({ from: "/pedidos/$id/gracias" });
  return (
    <OrderGate id={id}>
      {(order) => (
        <>
          <title>Pedido confirmado · LibroYa</title>
          <div className="mx-auto flex max-w-[640px] flex-col gap-6">
            <header className="flex flex-col items-center gap-2 text-center">
              <CircleCheck aria-hidden="true" className="size-12 text-success" />
              <h1>¡Gracias por tu compra!</h1>
              <p>Te enviamos un email de confirmación.</p>
              <p className="text-sm text-muted-foreground">
                Número de pedido: <OrderNumber id={order.id} />
              </p>
            </header>
            <OrderLines lines={order.lines} />
            <p className="flex items-baseline justify-between gap-3 text-lg font-semibold">
              <span>Total cobrado</span>
              <span className="money text-xl">{formatMoney(order.charged)}</span>
            </p>
            {order.shippingAddress ? <ShippingBlock address={order.shippingAddress} /> : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <Link to="/pedidos">Ver mis pedidos</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">Seguir comprando</Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </OrderGate>
  );
}
