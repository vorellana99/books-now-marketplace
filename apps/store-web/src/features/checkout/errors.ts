import { isApiError, isNetworkError } from "@/shared/api/errors.ts";
import { outcomeFor, type Outcome } from "@/shared/api/error-messages.ts";

// Lo que no se sabe: la respuesta nunca llegó, así que NO se afirma que no se cobró (HU-32)
export const UNCERTAIN_MESSAGE =
  "No pudimos confirmar tu pago. Si te llegó un cargo, no te preocupes: no se cobrará dos veces.";

const GENERIC: Outcome = {
  message: "Algo salió mal. Inténtalo de nuevo en unos minutos.",
  action: "none",
};

// El resultado de un error de `POST /orders`: el mensaje sale del `errorCode`, nunca del `message` de la API. Un `404` en una
// compra es el cliente de Ventas que aún no existe (o un libro): después del reintento se muestra el mensaje genérico
export function paymentOutcome(error: unknown): Outcome {
  if (isNetworkError(error))
    return { message: UNCERTAIN_MESSAGE, charged: "unknown", action: "retry-same-key" };
  if (isApiError(error) && error.status === 404) return GENERIC;
  return outcomeFor(error);
}
