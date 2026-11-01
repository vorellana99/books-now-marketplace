import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { isApiError } from "@/shared/api/errors.ts";
import type { OrderHistoryItem } from "@/shared/api/types.ts";
import { formatDateTime } from "@/shared/lib/dates.ts";
import { formatMoney } from "@/shared/lib/money.ts";
import { Alert } from "@/shared/ui/alert.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { Skeleton } from "@/shared/ui/skeleton.tsx";
import { EmptyState, ErrorState } from "@/shared/ui/state-panel.tsx";
import { useMyOrders } from "../hooks/use-orders.ts";
import { orderNumber } from "../order-number.ts";

// Solo `PLACED` existe hoy (producto 06: «Realizado»)
const STATUS: Record<OrderHistoryItem["status"], string> = { PLACED: "Realizado" };

// Cuántos libros (unidades) tiene el pedido: es una cuenta de cantidades, no de dinero
const bookCount = (order: OrderHistoryItem) =>
  order.lines.reduce((total, line) => total + line.quantity, 0);

function OrderRow({ order }: { order: OrderHistoryItem }) {
  const books = bookCount(order);
  return (
    <li>
      <Link
        to="/pedidos/$id"
        params={{ id: order.id }}
        className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card p-4 hover:border-primary"
      >
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="money font-semibold">{orderNumber(order.id)}</span>
          <span className="text-sm text-muted-foreground">{formatDateTime(order.createdAt)}</span>
          <span className="flex gap-2 text-sm text-muted-foreground">
            <span>
              {books} {books === 1 ? "libro" : "libros"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{STATUS[order.status]}</span>
          </span>
        </span>
        <span className="money text-lg font-semibold">{formatMoney(order.charged)}</span>
        <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground" />
      </Link>
    </li>
  );
}

// PA-08 · Mis pedidos (HU-40). La API ya los entrega del más reciente al más antiguo: la tienda no reordena. La página
// siguiente se pide con el `nextCursor` tal cual
export function OrdersPage() {
  const query = useMyOrders();
  // Se guarda antes de los retornos tempranos: dentro de ellos TypeScript estrecha `query` y deja de verla
  const { fetchNextPage } = query;

  if (query.isPending) {
    return (
      <>
        <title>Mis pedidos · LibroYa</title>
        <p role="status" className="sr-only">
          Cargando tus pedidos…
        </p>
        <div aria-hidden="true" className="mx-auto flex max-w-[720px] flex-col gap-3">
          <Skeleton className="h-9 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </>
    );
  }

  // Un error al pedir la página siguiente también deja `isError`, pero con los pedidos ya cargados a la vista: eso se
  // resuelve debajo de la lista, sin esconderla
  if (query.isError && !query.data) {
    // Un administrador no tiene pedidos: `GET /me/orders` es solo de compradores
    if (isApiError(query.error) && query.error.status === 403) {
      return (
        <>
          <title>Mis pedidos · LibroYa</title>
          <EmptyState
            as="h1"
            title="Esta cuenta no tiene pedidos: solo las cuentas de comprador compran."
          />
        </>
      );
    }
    return (
      <>
        <title>Mis pedidos · LibroYa</title>
        <ErrorState
          as="h1"
          onRetry={() => void query.refetch()}
          supportCode={isApiError(query.error) ? query.error.requestId : undefined}
        />
      </>
    );
  }

  const orders = query.data.pages.flatMap((page) => page.items);
  if (orders.length === 0) {
    return (
      <>
        <title>Mis pedidos · LibroYa</title>
        <h1 className="sr-only">Mis pedidos</h1>
        <EmptyState
          title="Aún no has hecho ninguna compra."
          action={
            <Button asChild>
              <Link to="/">Ver libros</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <title>Mis pedidos · LibroYa</title>
      <div className="mx-auto flex max-w-[720px] flex-col gap-4">
        <h1>Mis pedidos</h1>
        <ul aria-label="Pedidos" className="flex flex-col gap-3">
          {orders.map((order) => (
            <OrderRow key={order.id} order={order} />
          ))}
        </ul>
        {query.isFetchNextPageError ? (
          <Alert
            variant="error"
            action={
              <Button variant="outline" onClick={() => void fetchNextPage()}>
                Reintentar
              </Button>
            }
          >
            No pudimos cargar más pedidos.
          </Alert>
        ) : query.hasNextPage ? (
          <Button
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void fetchNextPage()}
            className="self-center"
          >
            {query.isFetchingNextPage ? "Cargando…" : "Cargar más pedidos"}
          </Button>
        ) : null}
      </div>
    </>
  );
}
