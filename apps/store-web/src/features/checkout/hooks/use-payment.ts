import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/features/auth/index.ts";
import { cartStore, timing } from "@/features/cart/index.ts";
import { isApiError } from "@/shared/api/errors.ts";
import { outcomeFor } from "@/shared/api/error-messages.ts";
import { addressStore } from "../address.store.ts";
import { placeOrder } from "../api.ts";
import { UNCERTAIN_MESSAGE } from "../errors.ts";
import { clearAttempt, fingerprint, keyFor } from "../idempotency.ts";
import type { ShippingAddress } from "../schemas.ts";

// La máquina de pago (docs/frontend/04-flujos-de-pantalla.md, sección 5)
export type PaymentState =
  | { status: "idle" }
  | { status: "sending" }
  // El primer intento sigue en curso: se vuelve a consultar sola, con la misma clave
  | { status: "waiting" }
  // No se sabe si se cobró (red caída, 5xx o una espera que no termina): se reintenta con la MISMA clave
  | { status: "uncertain"; message: string }
  // Un fallo de negocio: la próxima vez se usa una clave nueva
  | { status: "failed"; error: unknown };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Request = { address: ShippingAddress; cardToken: string };

// Pagar (HU-31 y HU-32). La clave de idempotencia es del intento: la misma ante un corte, un 5xx o CHECKOUT_IN_PROGRESS,
// y nueva si cambió el carrito o la dirección, o tras PREVIOUS_ATTEMPT_FAILED / IDEMPOTENCY_KEY_REUSED
export function usePayment() {
  const router = useRouter();
  const userId = useSession().user?.id ?? "";
  const [state, setState] = useState<PaymentState>({ status: "idle" });
  const busy = useRef(false);
  const last = useRef<Request | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const update = useCallback((next: PaymentState) => {
    if (mounted.current) setState(next);
  }, []);

  // Mientras se paga no se puede cerrar la pestaña sin confirmar
  const inProgress = state.status === "sending" || state.status === "waiting";
  useEffect(() => {
    if (!inProgress) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [inProgress]);

  const run = useCallback(
    async ({ address, cardToken }: Request) => {
      if (busy.current) return;
      busy.current = true;
      last.current = { address, cardToken };
      update({ status: "sending" });
      const items = cartStore
        .getState()
        .linesOf(userId)
        .map(({ isbn, quantity }) => ({ isbn, quantity }));
      let forceNew = false;
      let renewed = false;
      let notFoundRetries = 0;
      let polls = 0;
      try {
        for (;;) {
          // Si la persona se fue de la pantalla, no se sigue consultando: la clave queda guardada para el próximo intento
          if (!mounted.current) return;
          const key = keyFor(userId, fingerprint(items, address), { forceNew });
          forceNew = false;
          try {
            const order = await placeOrder({ key, items, address, cardToken });
            // El pedido existe: la clave ya no sirve, y el carrito y la dirección eran de esta compra
            clearAttempt();
            await router.navigate({ to: "/pedidos/$id/gracias", params: { id: order.orderId } });
            cartStore.getState().clear(userId);
            addressStore.getState().clear(userId);
            update({ status: "idle" });
            return;
          } catch (error) {
            if (isApiError(error)) {
              if (error.errorCode === "CHECKOUT_IN_PROGRESS") {
                if (polls >= timing.maxPolls)
                  return update({ status: "uncertain", message: UNCERTAIN_MESSAGE });
                polls += 1;
                update({ status: "waiting" });
                await sleep(timing.pollMs);
                continue;
              }
              if (
                (error.errorCode === "PREVIOUS_ATTEMPT_FAILED" ||
                  error.errorCode === "IDEMPOTENCY_KEY_REUSED") &&
                !renewed
              ) {
                renewed = true;
                forceNew = true;
                continue;
              }
              if (error.status === 404 && notFoundRetries < timing.newCustomerRetries) {
                // Justo después de registrarse, el cliente de Ventas se crea en segundo plano: se reintenta cada par de
                // segundos con la misma clave, hasta `timing.newCustomerRetries` veces
                notFoundRetries += 1;
                await sleep(timing.newCustomerRetryMs);
                continue;
              }
              if (error.status >= 500)
                return update({ status: "uncertain", message: outcomeFor(error).message });
              // Un fallo de negocio: no se cobró nada y la próxima compra necesita una clave nueva
              clearAttempt();
              return update({ status: "failed", error });
            }
            return update({ status: "uncertain", message: UNCERTAIN_MESSAGE });
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [router, update, userId],
  );

  return {
    state,
    pay: (address: ShippingAddress, cardToken: string) => run({ address, cardToken }),
    // Quita el aviso de fallo (por ejemplo, para probar con otra tarjeta)
    reset: () => update({ status: "idle" }),
    // Reintentar con lo mismo (y, por tanto, la misma clave)
    retry: () => (last.current ? run(last.current) : Promise.resolve()),
    inProgress,
  };
}
