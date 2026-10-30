import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { OrdersPage } from "@/features/orders/index.ts";

export const Route = createFileRoute("/pedidos/")({
  beforeLoad: requireSession,
  component: OrdersPage,
});
