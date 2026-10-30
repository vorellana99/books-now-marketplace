import { describe, expect, it } from "vite-plus/test";
import { KNOWN_ERROR_CODES, outcomeFor } from "@/shared/api/error-messages.ts";
import { ApiError, NetworkError, toApiError } from "@/shared/api/errors.ts";

const apiError = (status: number, errorCode?: string, message?: string) =>
  new ApiError({ status, errorCode, message, requestId: "req-1" });

describe("toApiError", () => {
  it("conserva el código, el mensaje y el identificador de la petición", () => {
    const response = new Response(null, { status: 422, headers: { "X-Request-Id": "abc-123" } });
    const error = toApiError(response, {
      statusCode: 422,
      errorCode: "OUT_OF_STOCK",
      message: "Sin stock",
    });
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(422);
    expect(error.errorCode).toBe("OUT_OF_STOCK");
    expect(error.message).toBe("Sin stock");
    expect(error.requestId).toBe("abc-123");
  });

  it("un 400 de validación trae details: se ignora y no rompe nada", () => {
    const error = toApiError(new Response(null, { status: 400 }), {
      statusCode: 400,
      errorCode: "VALIDATION_ERROR",
      message: "La petición no es válida",
      details: ["items debe tener al menos 1 elemento"],
    });
    expect(error.status).toBe(400);
    expect(error.errorCode).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("La petición no es válida");
  });

  it("tolera un cuerpo que no es el esperado", () => {
    expect(toApiError(new Response(null, { status: 500 }), "texto").errorCode).toBeUndefined();
    expect(toApiError(new Response(null, { status: 500 }), null).errorCode).toBeUndefined();
    expect(toApiError(new Response(null, { status: 500 }), { errorCode: 42 }).errorCode).toBe(
      undefined,
    );
  });
});

describe("outcomeFor", () => {
  it("tiene un mensaje para cada código conocido", () => {
    expect(KNOWN_ERROR_CODES.length).toBeGreaterThan(10);
    for (const code of KNOWN_ERROR_CODES) {
      const outcome = outcomeFor(apiError(422, code));
      expect(outcome.message, code).not.toBe("");
      expect(outcome.message, code).not.toBe(outcomeFor(apiError(422, "NO_EXISTE")).message);
    }
  });

  it("incluye los códigos de la compra y de la cuenta de producto 07", () => {
    for (const code of [
      "OUT_OF_STOCK",
      "STOCK_ITEM_NOT_FOUND",
      "PAYMENT_DECLINED",
      "CHECKOUT_IN_PROGRESS",
      "PREVIOUS_ATTEMPT_FAILED",
      "IDEMPOTENCY_KEY_REUSED",
      "INVALID_SHIPPING_ADDRESS",
      "MAX_QUANTITY_EXCEEDED",
      "CURRENCY_MISMATCH",
      "INVALID_CREDENTIALS",
      "EMAIL_ALREADY_REGISTERED",
      "INVALID_EMAIL",
      "WEAK_PASSWORD",
      "INVALID_REFRESH_TOKEN",
    ]) {
      expect(KNOWN_ERROR_CODES, code).toContain(code);
    }
  });

  it("elige el mensaje por el código y nunca por el texto del servidor", () => {
    const outcome = outcomeFor(apiError(422, "PAYMENT_DECLINED", "Card declined by issuer 0x51"));
    expect(outcome.message).toContain("rechazada");
    expect(outcome.message).not.toContain("issuer");
  });

  it("dice si se cobró: un rechazo no cobra", () => {
    expect(outcomeFor(apiError(422, "PAYMENT_DECLINED")).charged).toBe("no");
    expect(outcomeFor(apiError(422, "OUT_OF_STOCK")).charged).toBe("no");
  });

  it("un código desconocido muestra el mensaje genérico", () => {
    const outcome = outcomeFor(apiError(422, "ALGO_NUEVO"));
    expect(outcome.message).toBe("Algo salió mal. Inténtalo de nuevo en unos minutos.");
    expect(outcome.action).toBe("retry");
  });

  it("una red caída o un 5xx NO afirman que no se cobró: no se sabe", () => {
    for (const error of [new NetworkError(), apiError(500), apiError(503)]) {
      const outcome = outcomeFor(error);
      expect(outcome.charged).toBe("unknown");
      expect(outcome.action).toBe("retry-same-key");
      expect(outcome.message).not.toMatch(/no se te cobr[óo] nada/i);
    }
  });

  it("los códigos de error genéricos de la API (9.1) no tienen mensaje propio: ni afirman un cobro ni lo niegan", () => {
    for (const code of ["VALIDATION_ERROR", "ROUTE_NOT_FOUND", "METHOD_NOT_ALLOWED"]) {
      const status = code === "VALIDATION_ERROR" ? 400 : 404;
      expect(KNOWN_ERROR_CODES).not.toContain(code);
      const outcome = outcomeFor(apiError(status, code));
      expect(outcome.action).toBe("retry");
      expect(outcome.charged).toBeUndefined();
    }
    // un 500 con INTERNAL_ERROR se trata como cualquier 5xx: no se sabe si se cobró
    const server = outcomeFor(apiError(500, "INTERNAL_ERROR"));
    expect(server.charged).toBe("unknown");
    expect(server.action).toBe("retry-same-key");
  });

  it("un 429 pide esperar y un 401 sin código pide entrar", () => {
    expect(outcomeFor(apiError(429)).action).toBe("wait");
    expect(outcomeFor(apiError(401)).action).toBe("login");
  });

  it("un error que no es de la API da el mensaje genérico", () => {
    expect(outcomeFor(new Error("boom")).action).toBe("retry");
    expect(outcomeFor("texto")).toEqual(outcomeFor(undefined));
  });
});
