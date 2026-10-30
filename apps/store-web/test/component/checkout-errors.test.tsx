import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { timing } from "@/features/cart/timing.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { FakeOrders, quoteFor, quoteHandler } from "../support/orders.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const CLEAN: CartBook = {
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  unitPrice: { amount: "90.00", currency: "PEN" },
};
const PRICES = { [CLEAN.isbn]: "90.00" };

let auth: FakeAuth;
let orders: FakeOrders;
let userId: string;
beforeEach(() => {
  timing.newCustomerRetryMs = 5;
  timing.pollMs = 5;
  auth = new FakeAuth();
  orders = new FakeOrders(PRICES, (token) => auth.isAccessValid(token));
  server.use(
    ...auth.handlers(),
    ...orders.handlers(),
    searchHandler(() => page([bookNumber(1)])),
    http.get(API("/books/:isbn"), () => HttpResponse.json(book())),
    quoteHandler((items) => quoteFor(items, PRICES)),
  );
  userId = auth.signIn().user.id;
  cartStore.getState().add(userId, CLEAN);
});

const open = async () => {
  const app = await renderApp("/compra");
  await screen.findByRole("heading", { name: "Finaliza tu compra", level: 1 });
  const button = await screen.findByRole("button", { name: /^Pagar S\// });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  return app;
};
const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  const values: Record<string, string> = {
    Destinatario: "María Quispe",
    Teléfono: "+51 987 654 321",
    Dirección: "Jr. Ucayali 150",
    Distrito: "Barranco",
    Provincia: "Lima",
    Departamento: "Lima",
  };
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(label);
    await user.clear(field);
    await user.type(field, value);
  }
};
const payWith = async (user: ReturnType<typeof userEvent.setup>) => {
  await fill(user);
  await user.click(screen.getByRole("button", { name: /^Pagar S\// }));
};
const fail = async (status: number, code: string) => {
  orders.respondNext(() => apiError(status, code));
  const user = userEvent.setup();
  const app = await open();
  await payWith(user);
  const alert = await screen.findByRole("alert");
  return { user, alert, ...app };
};

describe("un fallo de negocio: el mensaje del código y si se cobró", () => {
  it.each([
    ["OUT_OF_STOCK", "No hay suficientes unidades de uno de tus libros. No se te cobró nada."],
    [
      "STOCK_ITEM_NOT_FOUND",
      "Uno de tus libros no está disponible por ahora. No se te cobró nada.",
    ],
    ["PAYMENT_DECLINED", "Tu tarjeta fue rechazada. No se te cobró nada. Prueba con otra tarjeta."],
    ["MAX_QUANTITY_EXCEEDED", "Puedes comprar hasta 10 unidades de cada libro."],
    ["CURRENCY_MISMATCH", "No puedes pagar libros en soles y en dólares en un mismo pedido."],
    ["PRICE_MISMATCH", "No pudimos procesar tu compra. No se te cobró nada."],
    ["UNSUPPORTED_CURRENCY", "No pudimos procesar tu compra. No se te cobró nada."],
    ["ALGUNA_REGLA_NUEVA", "No pudimos procesar tu compra. No se te cobró nada."],
  ])("%s", async (code, message) => {
    const { alert } = await fail(422, code);
    expect(alert.textContent).toContain(message);
  });

  it("siempre dice que no se cobró, aunque el mensaje del código no lo diga (HU-33)", async () => {
    // El mensaje de MAX_QUANTITY_EXCEEDED («Puedes comprar hasta 10 unidades de cada libro.») no lo dice por sí solo
    const { alert } = await fail(422, "MAX_QUANTITY_EXCEEDED");
    expect(alert.textContent).toContain("Puedes comprar hasta 10 unidades de cada libro.");
    expect(alert.textContent).toContain("No se te cobró nada.");
  });

  it("no muestra el texto técnico que manda el servidor", async () => {
    orders.respondNext(() =>
      HttpResponse.json(
        {
          statusCode: 422,
          errorCode: "OUT_OF_STOCK",
          message: "DETALLE TÉCNICO: stock_items.available",
        },
        { status: 422 },
      ),
    );
    const user = userEvent.setup();
    await open();
    await payWith(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("DETALLE TÉCNICO");
  });

  it("un código desconocido con un 400 muestra el mensaje genérico", async () => {
    const { alert } = await fail(400, "VALIDATION_ERROR");
    expect(alert.textContent).toContain("Algo salió mal. Inténtalo de nuevo en unos minutos.");
  });

  it("no tiene violaciones de accesibilidad con el error", async () => {
    const { container } = await fail(422, "OUT_OF_STOCK");
    await expectNoA11yViolations(container);
  });
});

describe("las acciones de cada fallo", () => {
  it.each([
    "OUT_OF_STOCK",
    "STOCK_ITEM_NOT_FOUND",
    "MAX_QUANTITY_EXCEEDED",
    "CURRENCY_MISMATCH",
    "PRICE_MISMATCH",
  ])("%s ofrece volver al carrito", async (code) => {
    const { alert } = await fail(422, code);
    const link = within(alert).getByRole("link", { name: "Volver al carrito" });
    expect(link.getAttribute("href")).toBe("/carrito");
  });

  it("PAYMENT_DECLINED ofrece probar con otra tarjeta, que lleva el foco al selector y quita el error", async () => {
    const { user, alert } = await fail(422, "PAYMENT_DECLINED");
    await user.click(within(alert).getByRole("button", { name: "Probar con otra tarjeta" }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Tarjeta de prueba")),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("tras una tarjeta rechazada, pagar con otra usa una clave nueva y funciona", async () => {
    const { user, alert } = await fail(422, "PAYMENT_DECLINED");
    await user.click(within(alert).getByRole("button", { name: "Probar con otra tarjeta" }));
    await user.selectOptions(screen.getByLabelText("Tarjeta de prueba"), "tok_visa");
    await user.click(screen.getByRole("button", { name: /^Pagar S\// }));
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).not.toBe(orders.requests[0]!.key);
    await waitFor(() => expect(orders.orderCount).toBe(1));
  });

  it("INVALID_SHIPPING_ADDRESS marca el teléfono con el error y lleva el foco a la dirección; no se cobró", async () => {
    const { alert } = await fail(422, "INVALID_SHIPPING_ADDRESS");
    expect(alert.textContent).toContain("Revisa tu dirección de envío, en especial el teléfono.");
    expect(alert.textContent).toContain("No se te cobró nada.");
    const phone = screen.getByLabelText("Teléfono");
    // El campo se marca en el render siguiente al del aviso (el formulario recibe el error por una prop)
    await waitFor(() => expect(phone.getAttribute("aria-invalid")).toBe("true"));
    await waitFor(() => expect(document.activeElement).toBe(phone));
    // lo escrito se conserva
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).value).toBe("María Quispe");
  });

  it("corregir la dirección y volver a pagar funciona, con una clave nueva", async () => {
    const { user } = await fail(422, "INVALID_SHIPPING_ADDRESS");
    const phone = screen.getByLabelText("Teléfono");
    await user.clear(phone);
    await user.type(phone, "987654321");
    await user.click(screen.getByRole("button", { name: /^Pagar S\// }));
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).not.toBe(orders.requests[0]!.key);
    await waitFor(() => expect(orders.orderCount).toBe(1));
  });

  it("la pantalla sigue editable después del fallo: no queda bloqueada", async () => {
    await fail(422, "OUT_OF_STOCK");
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /^Pagar S\// }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("un fallo no vacía el carrito ni borra la dirección", async () => {
    await fail(422, "OUT_OF_STOCK");
    expect(cartStore.getState().linesOf(userId)).toHaveLength(1);
    expect((screen.getByLabelText("Dirección") as HTMLInputElement).value).toBe("Jr. Ucayali 150");
  });
});

describe("cuando no se sabe si se cobró", () => {
  it("la red caída no dice «no se cobró nada»", async () => {
    orders.respondNext(() => HttpResponse.error());
    const user = userEvent.setup();
    await open();
    await payWith(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("no se cobrará dos veces");
    expect(alert.textContent).not.toMatch(/no se te cobr[óo] nada/i);
  });

  it("un 5xx tampoco, y ofrece reintentar", async () => {
    const { alert } = await fail(503, "INTERNAL_ERROR");
    expect(alert.textContent).not.toMatch(/no se te cobr[óo] nada/i);
    expect(within(alert).getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});

describe("la sesión", () => {
  it("si no se puede renovar a mitad del pago, pide entrar con la ruta de origen", async () => {
    const user = userEvent.setup();
    await open();
    await fill(user);
    // el token de acceso vence y el de refresco ya no sirve
    auth.expireAccessTokens();
    localStorage.setItem("libroya.refresh", "ya-no-sirve");
    await user.click(screen.getByRole("button", { name: /^Pagar S\// }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Finaliza tu compra" })).toBeNull(),
    );
    expect(await screen.findByRole("heading", { name: "Entra a tu cuenta" })).toBeTruthy();
  });

  it("un administrador (403) recibe el mensaje y puede entrar con otra cuenta", async () => {
    const { alert } = await fail(403, "FORBIDDEN");
    expect(alert.textContent).toContain("Esta cuenta es de administración y no puede comprar.");
    expect(within(alert).getByRole("link", { name: "Entrar con otra cuenta" })).toBeTruthy();
  });
});
