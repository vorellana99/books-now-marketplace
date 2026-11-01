import { ApiError, isApiError, isNetworkError } from "@/shared/api/errors.ts";
import {
  KNOWN_ERROR_CODES,
  outcomeFor,
  type KnownErrorCode,
  type Outcome,
} from "@/shared/api/error-messages.ts";

const isKnownCode = (code: string | undefined): code is KnownErrorCode =>
  code !== undefined && (KNOWN_ERROR_CODES as string[]).includes(code);

// Lo que no se sabe: la respuesta nunca llegó, así que NO se afirma que no se cobró (HU-32)
export const UNCERTAIN_MESSAGE =
  "No pudimos confirmar tu pago. Si te llegó un cargo, no te preocupes: no se cobrará dos veces.";

const GENERIC: Outcome = {
  message: "Algo salió mal. Inténtalo de nuevo en unos minutos.",
  action: "none",
};

// El resultado de un error de `POST /orders`: el mensaje sale del `errorCode`, nunca del `message` de la API (tabla «Compra»
// de docs/product/07-contenido-y-mensajes.md)
export function paymentOutcome(error: unknown): Outcome {
  if (isNetworkError(error)) {
    return { message: UNCERTAIN_MESSAGE, charged: "unknown", action: "retry-same-key" };
  }
  if (isApiError(error)) {
    // Un `404` en una compra es el cliente de Ventas que aún no existe (o un libro): tras el reintento, el genérico
    if (error.status === 404) return GENERIC;
    // Un administrador no es un cliente: no puede comprar
    if (error.status === 403) {
      return {
        message:
          "Esta cuenta es de administración y no puede comprar. Entra con una cuenta de comprador.",
        action: "login",
      };
    }
    // Otra regla de dominio (un 422 con un código que la tienda no conoce): lo mismo que `PRICE_MISMATCH`, sin cobro
    if (error.status === 422 && !isKnownCode(error.errorCode)) {
      return outcomeFor(new ApiError({ status: 422, errorCode: "PRICE_MISMATCH" }));
    }
    if (error.status === 400) return GENERIC;
  }
  return outcomeFor(error);
}

// Si el mensaje de un fallo de negocio no dice por sí solo si se cobró, la pantalla lo añade (HU-33: siempre se dice)
export const NOT_CHARGED = "No se te cobró nada.";
export const chargedNote = (outcome: Outcome): string | undefined =>
  outcome.charged === "no" && !/cobr/i.test(outcome.message) ? NOT_CHARGED : undefined;
