import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/features/auth/index.ts";
import { OrderConfirmationPage } from "@/features/orders/index.ts";

export const Route = createFileRoute("/pedidos/$id/gracias")({
  beforeLoad: requireSession,
  component: OrderConfirmationPage,
});
