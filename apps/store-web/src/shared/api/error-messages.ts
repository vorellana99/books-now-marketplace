import { isApiError, isNetworkError } from "./errors.ts";

// Qué hacer después de un error. La pantalla decide cómo ofrecerlo
export type ErrorAction =
  | "none"
  | "retry"
  | "retry-same-key" // reintentar la compra con la MISMA Idempotency-Key
  | "retry-new-key" // reintentar la compra con una clave NUEVA
  | "wait"
  | "login"
  | "go-cart"
  | "change-card"
  | "fix-address";

// `charged` solo importa en una compra: "no" = no se cobró nada; "unknown" = no se sabe (hay que reintentar con la misma clave)
export type Outcome = {
  message: string;
  charged?: "no" | "unknown";
  action: ErrorAction;
};

// Textos de docs/product/07-contenido-y-mensajes.md. Se eligen por `errorCode`, nunca por el `message` del servidor
const BY_CODE = {
  // Cuenta y sesión
  INVALID_CREDENTIALS: { message: "Correo o contraseña incorrectos.", action: "none" },
  EMAIL_ALREADY_REGISTERED: {
    message: "Ya existe una cuenta con ese correo. ¿Quieres entrar?",
    action: "login",
  },
  INVALID_EMAIL: { message: "Escribe un correo válido.", action: "none" },
  WEAK_PASSWORD: {
    message:
      "Elige una contraseña más segura: al menos 10 caracteres y que no sea una de las más comunes.",
    action: "none",
  },
  INVALID_REFRESH_TOKEN: {
    message: "Tu sesión terminó. Entra de nuevo para continuar.",
    action: "login",
  },
  UNAUTHENTICATED: { message: "Entra para continuar.", action: "login" },
  // Catálogo y pedidos
  NOT_FOUND: { message: "No encontramos lo que buscabas.", action: "none" },
  INVALID_ISBN: { message: "Este libro no está disponible.", action: "none" },
  // Compra
  OUT_OF_STOCK: {
    message: "No hay suficientes unidades de uno de tus libros. No se te cobró nada.",
    charged: "no",
    action: "go-cart",
  },
  STOCK_ITEM_NOT_FOUND: {
    message: "Uno de tus libros no está disponible por ahora. No se te cobró nada.",
    charged: "no",
    action: "go-cart",
  },
  PAYMENT_DECLINED: {
    message: "Tu tarjeta fue rechazada. No se te cobró nada. Prueba con otra tarjeta.",
    charged: "no",
    action: "change-card",
  },
  CHECKOUT_IN_PROGRESS: {
    message: "Estamos procesando tu pago. Espera un momento.",
    action: "wait",
  },
  PREVIOUS_ATTEMPT_FAILED: {
    message: "Tu intento anterior no se completó. Vamos a intentarlo de nuevo.",
    charged: "no",
    action: "retry-new-key",
  },
  IDEMPOTENCY_KEY_REUSED: {
    message: "Cambiaste algo en tu compra. Vamos a intentarlo de nuevo con los datos nuevos.",
    charged: "no",
    action: "retry-new-key",
  },
  INVALID_SHIPPING_ADDRESS: {
    message: "Revisa tu dirección de envío, en especial el teléfono.",
    charged: "no",
    action: "fix-address",
  },
  MAX_QUANTITY_EXCEEDED: {
    message: "Puedes comprar hasta 10 unidades de cada libro.",
    charged: "no",
    action: "go-cart",
  },
  CURRENCY_MISMATCH: {
    message: "No puedes pagar libros en soles y en dólares en un mismo pedido.",
    charged: "no",
    action: "go-cart",
  },
  PRICE_MISMATCH: {
    message: "No pudimos procesar tu compra. No se te cobró nada.",
    charged: "no",
    action: "go-cart",
  },
  UNSUPPORTED_CURRENCY: {
    message: "No pudimos procesar tu compra. No se te cobró nada.",
    charged: "no",
    action: "go-cart",
  },
} as const satisfies Record<string, Outcome>;

export type KnownErrorCode = keyof typeof BY_CODE;

// Los códigos con mensaje propio; una prueba comprueba que cada uno tiene entrada
export const KNOWN_ERROR_CODES = Object.keys(BY_CODE) as KnownErrorCode[];

const GENERIC: Outcome = {
  message: "Algo salió mal. Inténtalo de nuevo en unos minutos.",
  action: "retry",
};

const OFFLINE: Outcome = {
  message: "Parece que no tienes conexión a internet.",
  charged: "unknown",
  action: "retry-same-key",
};

const RATE_LIMITED: Outcome = {
  message: "Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  action: "wait",
};

// No se sabe si el servidor llegó a cobrar: no se afirma que no se cobró
const SERVER_FAILED: Outcome = {
  message: "Algo falló de nuestro lado. Puedes reintentar; no se te cobrará dos veces.",
  charged: "unknown",
  action: "retry-same-key",
};

const isKnown = (code: string | undefined): code is KnownErrorCode =>
  code !== undefined && Object.hasOwn(BY_CODE, code);

// El mensaje y la acción para cualquier error: de la API, de red o inesperado
export function outcomeFor(error: unknown): Outcome {
  if (isNetworkError(error)) return OFFLINE;
  if (!isApiError(error)) return GENERIC;
  if (error.status === 429) return RATE_LIMITED;
  if (isKnown(error.errorCode)) return BY_CODE[error.errorCode];
  if (error.status === 401) return BY_CODE.UNAUTHENTICATED;
  if (error.status >= 500) return SERVER_FAILED;
  return GENERIC;
}
