import { isApiError } from "@/shared/api/errors.ts";
import { outcomeFor } from "@/shared/api/error-messages.ts";

const GENERIC = "Algo salió mal. Inténtalo de nuevo en unos minutos.";

// El mensaje de un error de cuenta (entrar o registrarse). `INVALID_CREDENTIALS` es un solo mensaje que no dice cuál de
// los dos datos falla. Un 5xx no usa el texto de la compra («no se te cobrará dos veces»): aquí no hay cobro
export function accountErrorMessage(error: unknown): string {
  if (isApiError(error) && error.status >= 500) return GENERIC;
  const { message } = outcomeFor(error);
  return message;
}
