import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { OrderDetailPage } from "@/features/orders/index.ts";

export const Route = createFileRoute("/pedidos/$id/")({
  beforeLoad: requireSession,
  component: OrderDetailPage,
});
