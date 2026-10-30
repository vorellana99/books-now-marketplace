import { describe, expect, it } from "vite-plus/test";
import { paymentOutcome, UNCERTAIN_MESSAGE } from "@/features/checkout/errors.ts";
import { ApiError, NetworkError } from "@/shared/api/errors.ts";

const api = (status: number, errorCode?: string, message = "DETALLE TÉCNICO DEL SERVIDOR") =>
  new ApiError({ status, errorCode, message });

// La tabla «Compra (POST /orders)» de docs/product/07-contenido-y-mensajes.md
describe("paymentOutcome: un mensaje y una acción por cada código de la compra", () => {
  it.each([
    [
      "OUT_OF_STOCK",
      "No hay suficientes unidades de uno de tus libros. No se te cobró nada.",
      "no",
      "go-cart",
    ],
    [
      "STOCK_ITEM_NOT_FOUND",
      "Uno de tus libros no está disponible por ahora. No se te cobró nada.",
      "no",
      "go-cart",
    ],
    [
      "PAYMENT_DECLINED",
      "Tu tarjeta fue rechazada. No se te cobró nada. Prueba con otra tarjeta.",
      "no",
      "change-card",
    ],
    [
      "PREVIOUS_ATTEMPT_FAILED",
      "Tu intento anterior no se completó. Vamos a intentarlo de nuevo.",
      "no",
      "retry-new-key",
    ],
    [
      "IDEMPOTENCY_KEY_REUSED",
      "Cambiaste algo en tu compra. Vamos a intentarlo de nuevo con los datos nuevos.",
      "no",
      "retry-new-key",
    ],
    [
      "INVALID_SHIPPING_ADDRESS",
      "Revisa tu dirección de envío, en especial el teléfono.",
      "no",
      "fix-address",
    ],
    ["MAX_QUANTITY_EXCEEDED", "Puedes comprar hasta 10 unidades de cada libro.", "no", "go-cart"],
    [
      "CURRENCY_MISMATCH",
      "No puedes pagar libros en soles y en dólares en un mismo pedido.",
      "no",
      "go-cart",
    ],
    ["PRICE_MISMATCH", "No pudimos procesar tu compra. No se te cobró nada.", "no", "go-cart"],
    [
      "UNSUPPORTED_CURRENCY",
      "No pudimos procesar tu compra. No se te cobró nada.",
      "no",
      "go-cart",
    ],
  ])("%s", (code, message, charged, action) => {
    expect(paymentOutcome(api(422, code))).toEqual({ message, charged, action });
  });

  it("otra regla de dominio (un 422 con un código que no conocemos) dice lo mismo que PRICE_MISMATCH", () => {
    expect(paymentOutcome(api(422, "ALGUNA_REGLA_NUEVA"))).toEqual({
      message: "No pudimos procesar tu compra. No se te cobró nada.",
      charged: "no",
      action: "go-cart",
    });
  });

  it("el mensaje sale del código, nunca del `message` del servidor", () => {
    for (const code of ["OUT_OF_STOCK", "PAYMENT_DECLINED", "ALGUNA_REGLA_NUEVA"]) {
      expect(paymentOutcome(api(422, code)).message).not.toContain("DETALLE TÉCNICO");
    }
  });

  it("la red caída NO afirma que no se cobró: no se sabe", () => {
    const outcome = paymentOutcome(new NetworkError());
    expect(outcome.message).toBe(UNCERTAIN_MESSAGE);
    expect(outcome.charged).toBe("unknown");
    expect(outcome.action).toBe("retry-same-key");
    expect(outcome.message).not.toMatch(/no se te cobr[óo] nada/i);
  });

  it("un 5xx tampoco afirma que no se cobró", () => {
    const outcome = paymentOutcome(api(503, "INTERNAL_ERROR"));
    expect(outcome.message).toBe(
      "Algo falló de nuestro lado. Puedes reintentar; no se te cobrará dos veces.",
    );
    expect(outcome.charged).toBe("unknown");
    expect(outcome.action).toBe("retry-same-key");
  });

  it("un 404 (el cliente de Ventas que aún no existe, tras el reintento) es el error genérico", () => {
    expect(paymentOutcome(api(404, "NOT_FOUND")).message).toBe(
      "Algo salió mal. Inténtalo de nuevo en unos minutos.",
    );
  });

  it("un 401 pide entrar", () => {
    const outcome = paymentOutcome(api(401, "UNAUTHENTICATED"));
    expect(outcome.action).toBe("login");
  });

  it("un 403 (un administrador no puede comprar) lo dice y pide entrar con otra cuenta", () => {
    const outcome = paymentOutcome(api(403, "FORBIDDEN"));
    expect(outcome.message).toBe(
      "Esta cuenta es de administración y no puede comprar. Entra con una cuenta de comprador.",
    );
    expect(outcome.action).toBe("login");
  });

  it("un 400 o un error que no es de la API es el genérico", () => {
    expect(paymentOutcome(api(400, "VALIDATION_ERROR")).message).toBe(
      "Algo salió mal. Inténtalo de nuevo en unos minutos.",
    );
    expect(paymentOutcome(new Error("boom")).message).toBe(
      "Algo salió mal. Inténtalo de nuevo en unos minutos.",
    );
  });
});
