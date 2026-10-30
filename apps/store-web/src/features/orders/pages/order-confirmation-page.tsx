import { Link, useParams } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { isApiError } from "@/shared/api/errors.ts";
import { formatMoney } from "@/shared/lib/money.ts";
import { Button } from "@/shared/ui/button.tsx";
import { Skeleton } from "@/shared/ui/skeleton.tsx";
import { ErrorState, NotFoundState } from "@/shared/ui/state-panel.tsx";
import { OrderLines } from "../components/order-lines.tsx";
import { OrderNumber } from "../components/order-number.tsx";
import { ShippingBlock } from "../components/shipping-block.tsx";
import { useOrder } from "../hooks/use-orders.ts";

// Un pedido que no existe (`404`), que es de otra persona (también `404`) o con un número mal formado (`400`) se ve igual:
// no es un error de la persona ni de la tienda
const isMissing = (error: unknown) =>
  isApiError(error) && (error.status === 404 || error.status === 400);

const Actions = () => (
  <div className="flex flex-col gap-2 sm:flex-row">
    <Button asChild>
      <Link to="/pedidos">Ver mis pedidos</Link>
    </Button>
    <Button asChild variant="outline">
      <Link to="/">Seguir comprando</Link>
    </Button>
  </div>
);

// PA-07 · Confirmación (HU-34). Se lee el pedido de la API, nunca de la memoria: recargar muestra lo mismo, y el total es el
// que se cobró de verdad (RN-08), no el que se cotizó
export function OrderConfirmationPage() {
  const { id } = useParams({ from: "/pedidos/$id/gracias" });
  const query = useOrder(id);

  if (query.isPending) {
    return (
      <>
        <title>Tu pedido · LibroYa</title>
        <p role="status" className="sr-only">
          Cargando tu pedido…
        </p>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      </>
    );
  }

  if (query.isError) {
    if (isMissing(query.error)) {
      return (
        <>
          <title>Pedido no encontrado · LibroYa</title>
          <NotFoundState as="h1" title="No encontramos este pedido." action={<Actions />} />
        </>
      );
    }
    return (
      <>
        <title>Tu pedido · LibroYa</title>
        <ErrorState
          as="h1"
          onRetry={() => void query.refetch()}
          supportCode={isApiError(query.error) ? query.error.requestId : undefined}
        />
      </>
    );
  }

  const order = query.data;
  return (
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
        <Actions />
      </div>
    </>
  );
}
