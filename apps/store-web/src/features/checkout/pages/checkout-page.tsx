import { Link } from "@tanstack/react-router";
import { useCallback, useId, useState } from "react";
import { useStore } from "zustand";
import { useSession } from "@/features/auth/index.ts";
import {
  OrderSummary,
  useCartLines,
  useCartRevalidation,
  useQuote,
} from "@/features/cart/index.ts";
import { isApiError } from "@/shared/api/errors.ts";
import { formatMoney } from "@/shared/lib/money.ts";
import { Alert } from "@/shared/ui/alert.tsx";
import { Button } from "@/shared/ui/button.tsx";
import { EmptyState } from "@/shared/ui/state-panel.tsx";
import { addressStore } from "../address.store.ts";
import { paymentOutcome } from "../errors.ts";
import { usePayment } from "../hooks/use-payment.ts";
import { ShippingForm } from "../components/shipping-form.tsx";
import type { ShippingInput } from "../schemas.ts";

// Tarjetas de prueba de la pasarela simulada (DP-06): solo existen fuera de producción. La tarjeta real nunca pasa por
// LibroYa (RN-24): se enviaría un código de la pasarela, no su número
export const TEST_CARDS = [
  { token: "tok_visa", label: "Aprobada" },
  { token: "tok_declined", label: "Rechazada" },
  { token: "tok_error", label: "Error del servidor" },
] as const;

// PA-06 · Dirección y pago (HU-30 a HU-33)
export function CheckoutPage() {
  const userId = useSession().user?.id ?? "";
  const lines = useCartLines();
  const revalidation = useCartRevalidation();
  const quote = useQuote(lines, !revalidation.checking && !revalidation.blocked);
  const draft = useStore(addressStore, (state) => state.draftOf(userId));
  const [initialDraft] = useState(draft);
  const [cardToken, setCardToken] = useState<string>(TEST_CARDS[0].token);
  const cardId = useId();
  const payment = usePayment();

  const saveDraft = useCallback(
    (values: ShippingInput) => addressStore.getState().setDraft(userId, values),
    [userId],
  );

  if (lines.length === 0) {
    return (
      <>
        <title>Pagar · LibroYa</title>
        <h1 className="sr-only">Finaliza tu compra</h1>
        <EmptyState
          title="Tu carrito está vacío."
          description="Agrega libros para poder pagar."
          action={
            <Button asChild>
              <Link to="/">Ver libros</Link>
            </Button>
          }
        />
      </>
    );
  }
  if (revalidation.blocked) {
    return (
      <>
        <title>Pagar · LibroYa</title>
        <h1 className="sr-only">Finaliza tu compra</h1>
        <EmptyState
          title="Hay libros en tu carrito que ya no están disponibles. Quítalos para continuar."
          action={
            <Button asChild>
              <Link to="/carrito">Volver al carrito</Link>
            </Button>
          }
        />
      </>
    );
  }

  const quoted = quote.data;
  const quoteBusy = quote.isFetching;
  const canPay =
    quoted !== undefined &&
    !quoteBusy &&
    !quote.isError &&
    !revalidation.checking &&
    !payment.inProgress;

  return (
    <>
      <title>Pagar · LibroYa</title>
      <div className="flex flex-col gap-6">
        <h1>Finaliza tu compra</h1>
        <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
          <div className="flex flex-col gap-8">
            <section aria-labelledby="envio" className="flex flex-col gap-4">
              <h2 id="envio">Envío</h2>
              <ShippingForm
                defaultValues={initialDraft}
                onChange={saveDraft}
                disabled={payment.inProgress}
                onSubmit={(address) => void payment.pay(address, cardToken)}
              />
            </section>
            <section aria-labelledby="pago" className="flex flex-col gap-3">
              <h2 id="pago">Pago</h2>
              <p className="text-sm text-muted-foreground">
                El número de tu tarjeta nunca se envía a LibroYa: solo un código de la pasarela de
                pago.
              </p>
              {import.meta.env.PROD ? null : (
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={cardId} className="font-medium">
                    Tarjeta de prueba
                  </label>
                  <select
                    id={cardId}
                    value={cardToken}
                    onChange={(event) => setCardToken(event.target.value)}
                    className="h-11 rounded-md border border-input bg-card px-3 text-base"
                  >
                    {TEST_CARDS.map((card) => (
                      <option key={card.token} value={card.token}>
                        {card.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          </div>
          <aside className="flex flex-col gap-4 md:sticky md:top-4 md:self-start">
            <h2 className="text-lg">Tu pedido</h2>
            {quote.isError && !quoted ? (
              <Alert
                variant="error"
                action={
                  <Button variant="outline" onClick={() => void quote.refetch()}>
                    Reintentar
                  </Button>
                }
              >
                <p>No pudimos calcular tu total.</p>
                {isApiError(quote.error) && quote.error.requestId ? (
                  <p className="mt-1 text-xs">
                    Código de soporte:{" "}
                    <span className="money select-all">{quote.error.requestId}</span>
                  </p>
                ) : null}
              </Alert>
            ) : quoted ? (
              <OrderSummary quote={quoted} busy={quoteBusy} />
            ) : null}
            {payment.state.status === "sending" || payment.state.status === "waiting" ? (
              <Alert variant="info" role="status" label="Estado del pago">
                {payment.state.status === "waiting" ? (
                  <p>Estamos procesando tu pago. Espera un momento.</p>
                ) : (
                  <>
                    <p className="font-semibold">Procesando tu pago…</p>
                    <p>No cierres esta página.</p>
                  </>
                )}
              </Alert>
            ) : null}
            {payment.state.status === "uncertain" ? (
              <Alert
                variant="warning"
                action={
                  <Button variant="outline" onClick={() => void payment.retry()}>
                    Reintentar
                  </Button>
                }
              >
                {payment.state.message}
              </Alert>
            ) : null}
            {payment.state.status === "failed" ? (
              <Alert variant="error">{paymentOutcome(payment.state.error).message}</Alert>
            ) : null}
            <Button type="submit" form="shipping-form" disabled={!canPay} className="w-full">
              {payment.inProgress
                ? "Procesando…"
                : quoted
                  ? `Pagar ${formatMoney(quoted.total)}`
                  : "Pagar"}
            </Button>
            {payment.inProgress ? null : (
              <Button asChild variant="ghost" className="w-full">
                <Link to="/carrito">Volver al carrito</Link>
              </Button>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
