import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { isApiError } from "@/shared/api/errors.ts";
import type { Order } from "@/shared/api/types.ts";
import { Button } from "@/shared/ui/button.tsx";
import { Skeleton } from "@/shared/ui/skeleton.tsx";
import { ErrorState, NotFoundState } from "@/shared/ui/state-panel.tsx";
import { useOrder } from "../hooks/use-orders.ts";

// Un pedido que no existe (`404`), que es de otra persona (también `404`) o con un número mal formado (`400`) se ve igual:
// no es un error de la persona ni de la tienda
const isMissing = (error: unknown) =>
  isApiError(error) && (error.status === 404 || error.status === 400);

// Los estados que comparten la confirmación (PA-07) y el detalle (PA-09): cargando, no encontrado y error. Con el pedido en
// mano, dibuja lo que cada pantalla le pida
export function OrderGate({ id, children }: { id: string; children: (order: Order) => ReactNode }) {
  const query = useOrder(id);

  if (query.isPending) {
    return (
      <>
        <title>Tu pedido · LibroYa</title>
        <p role="status" className="sr-only">
          Cargando tu pedido…
        </p>
        <div aria-hidden="true" className="mx-auto flex max-w-[640px] flex-col gap-4">
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
          <NotFoundState
            as="h1"
            title="No encontramos este pedido."
            action={
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button asChild>
                  <Link to="/pedidos">Ver mis pedidos</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">Seguir comprando</Link>
                </Button>
              </div>
            }
          />
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

  return <>{children(query.data)}</>;
}
