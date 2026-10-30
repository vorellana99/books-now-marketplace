import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { timing } from "@/features/cart/timing.ts";
import { addressStore } from "@/features/checkout/address.store.ts";
import { ATTEMPT_KEY } from "@/features/checkout/idempotency.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import { FakeOrders, quoteFor, quoteHandler } from "../support/orders.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const CLEAN: CartBook = {
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  unitPrice: { amount: "90.00", currency: "PEN" },
};
const DDD: CartBook = {
  isbn: "9780321125217",
  title: "Domain-Driven Design",
  author: "Eric Evans",
  unitPrice: { amount: "120.00", currency: "PEN" },
};
const PRICES = { [CLEAN.isbn]: "90.00", [DDD.isbn]: "120.00" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let auth: FakeAuth;
let orders: FakeOrders;
let userId: string;
beforeEach(() => {
  timing.newCustomerRetryMs = 5;
  timing.pollMs = 5;
  timing.maxPolls = 3;
  auth = new FakeAuth();
  orders = new FakeOrders(PRICES, (token) => auth.isAccessValid(token));
  server.use(
    ...auth.handlers(),
    ...orders.handlers(),
    searchHandler(() => page([bookNumber(1)])),
    http.get(API("/books/:isbn"), ({ params }) => {
      const found = [CLEAN, DDD].find((b) => b.isbn === params.isbn);
      return found
        ? HttpResponse.json(book({ ...found, price: found.unitPrice }))
        : apiError(404, "NOT_FOUND");
    }),
    quoteHandler((items) => quoteFor(items, PRICES)),
  );
  userId = auth.signIn().user.id;
  cartStore.getState().add(userId, CLEAN);
});

// El botón de pagar existe antes de que la cotización esté lista; hasta que se habilita, un clic no hace nada
const readyToPay = async () => {
  const button = await screen.findByRole("button", { name: /^Pagar S\// });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
};
const open = async () => {
  const app = await renderApp("/compra");
  await screen.findByRole("heading", { name: "Finaliza tu compra", level: 1 });
  await readyToPay();
  return app;
};
const fillAddress = async (
  user: ReturnType<typeof userEvent.setup>,
  overrides: Record<string, string> = {},
) => {
  const values: Record<string, string> = {
    Destinatario: "  María Quispe ",
    Teléfono: "+51 987 654 321",
    Dirección: "Jr. Ucayali 150, Dpto 2",
    Distrito: "Barranco",
    Provincia: "Lima",
    Departamento: "Lima",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    const field = screen.getByLabelText(label) as HTMLInputElement;
    await user.clear(field);
    if (value) await user.type(field, value);
  }
};
const pay = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Pagar S\// }));

describe("pagar: el pedido se crea", () => {
  it("envía la clave de idempotencia, ISBN y cantidad, la dirección recortada y el código de la tarjeta; nada más", async () => {
    const user = userEvent.setup();
    cartStore.getState().add(userId, DDD);
    await open();
    await fillAddress(user);
    await pay(user);
    await waitFor(() => expect(orders.requests).toHaveLength(1));
    const sent = orders.requests[0]!;
    expect(sent.key).toMatch(UUID);
    expect(sent.authorization).toMatch(/^Bearer /);
    expect(sent.body).toEqual({
      cardToken: "tok_visa",
      items: [
        { isbn: CLEAN.isbn, quantity: 1 },
        { isbn: DDD.isbn, quantity: 1 },
      ],
      shippingAddress: {
        recipient: "María Quispe",
        phone: "+51 987 654 321",
        line1: "Jr. Ucayali 150, Dpto 2",
        district: "Barranco",
        province: "Lima",
        department: "Lima",
      },
    });
  });

  it("con el pedido creado: va a la confirmación, vacía solo el carrito de esa cuenta y borra la clave y el borrador", async () => {
    const user = userEvent.setup();
    const otherUser = auth.addUser("luis@example.com", "LibroYa-dev-2026");
    cartStore.getState().add(otherUser.id, DDD);
    const { router } = await open();
    await fillAddress(user);
    await pay(user);
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/pedidos\/[0-9a-f-]{36}\/gracias$/),
    );
    expect(router.state.location.pathname).toContain([...orders.created.values()][0]!.orderId);
    expect(cartStore.getState().linesOf(userId)).toEqual([]);
    expect(cartStore.getState().linesOf(otherUser.id)).toHaveLength(1);
    expect(sessionStorage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(addressStore.getState().draftOf(userId).recipient).toBe("");
  });

  it("el código de la tarjeta de prueba elegida es el que se envía", async () => {
    const user = userEvent.setup();
    await open();
    await user.selectOptions(screen.getByLabelText("Tarjeta de prueba"), "tok_declined");
    await fillAddress(user);
    orders.respondNext(() => apiError(422, "PAYMENT_DECLINED"));
    await pay(user);
    await waitFor(() => expect(orders.requests).toHaveLength(1));
    expect(orders.requests[0]!.body.cardToken).toBe("tok_declined");
  });

  it("no envía el cliente: el cuerpo no lleva customerId (RN-23, DP-09)", async () => {
    const user = userEvent.setup();
    await open();
    await fillAddress(user);
    await pay(user);
    await waitFor(() => expect(orders.requests).toHaveLength(1));
    expect(JSON.stringify(orders.requests[0]!.body)).not.toMatch(/customerId|price|amount/i);
  });
});

describe("pagar: mientras se procesa", () => {
  it("avisa «Procesando tu pago…», deshabilita el formulario y el botón, y no se envía dos veces", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    server.use(
      http.post(API("/orders"), async ({ request }) => {
        orders.requests.push({
          key: request.headers.get("Idempotency-Key"),
          authorization: null,
          body: {},
        });
        await gate.promise;
        return HttpResponse.json(
          { orderId: crypto.randomUUID(), charged: { amount: "100.00", currency: "PEN" } },
          { status: 201 },
        );
      }),
    );
    await open();
    await fillAddress(user);
    await pay(user);
    const status = await screen.findByRole("status", { name: "Estado del pago" });
    expect(status.textContent).toContain("Procesando tu pago…");
    expect(status.textContent).toContain("No cierres esta página.");
    const busy = screen.getByRole("button", { name: "Procesando…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).disabled).toBe(true);
    await user.click(busy);
    expect(screen.queryByRole("link", { name: "Volver al carrito" })).toBeNull(); // no se puede salir sin confirmar
    gate.release();
    await waitFor(() =>
      expect(screen.queryByRole("status", { name: "Estado del pago" })).toBeNull(),
    );
    expect(orders.requests).toHaveLength(1);
  });

  it("no tiene violaciones de accesibilidad mientras procesa", async () => {
    const user = userEvent.setup();
    const gate = deferred();
    server.use(
      http.post(API("/orders"), async () => {
        await gate.promise;
        return apiError(500, "INTERNAL_ERROR");
      }),
    );
    const { container } = await open();
    await fillAddress(user);
    await pay(user);
    await screen.findByRole("status", { name: "Estado del pago" });
    await expectNoA11yViolations(container);
    gate.release();
  });
});

describe("reintentar sin cobrar dos veces (HU-32)", () => {
  it("tras un corte de red (el pedido sí se creó) reintenta con la MISMA clave y recibe el mismo pedido, sin segundo cobro", async () => {
    const user = userEvent.setup();
    orders.dropNextResponse();
    const { router } = await open();
    await fillAddress(user);
    await pay(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "No pudimos confirmar tu pago. Si te llegó un cargo, no te preocupes: no se cobrará dos veces.",
    );
    // no afirma que no se cobró
    expect(alert.textContent).not.toMatch(/no se te cobró nada/i);
    expect(orders.orderCount).toBe(1);

    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/gracias$/));
    expect(orders.requests).toHaveLength(2);
    expect(orders.requests[1]!.key).toBe(orders.requests[0]!.key);
    expect(orders.requests[1]!.body).toEqual(orders.requests[0]!.body);
    expect(orders.orderCount).toBe(1); // un solo pedido, un solo cobro
  });

  it("tras un 5xx también reintenta con la misma clave", async () => {
    const user = userEvent.setup();
    orders.respondNext(() => apiError(500, "INTERNAL_ERROR"));
    await open();
    await fillAddress(user);
    await pay(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "Algo falló de nuestro lado. Puedes reintentar; no se te cobrará dos veces.",
    );
    await user.click(within(alert).getByRole("button", { name: "Reintentar" }));
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).toBe(orders.requests[0]!.key);
  });

  it("mientras la clave sigue vigente, la incierta se conserva en sessionStorage", async () => {
    const user = userEvent.setup();
    orders.dropNextResponse();
    await open();
    await fillAddress(user);
    await pay(user);
    await screen.findByRole("alert");
    expect(JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "{}").key).toBe(
      orders.requests[0]!.key,
    );
  });

  it("si se recarga la página en medio del pago, el reintento usa la misma clave (DP-14)", async () => {
    const user = userEvent.setup();
    orders.dropNextResponse();
    const first = await open();
    await fillAddress(user);
    await pay(user);
    await screen.findByRole("alert");
    const key = orders.requests[0]!.key;
    first.unmount();

    // La página se vuelve a abrir: el borrador de la dirección y la clave siguen ahí
    await open();
    await pay(userEvent.setup());
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).toBe(key);
    expect(orders.orderCount).toBe(1);
  });

  it("si cambia la dirección entre el intento y el reintento, la clave es NUEVA", async () => {
    const user = userEvent.setup();
    orders.respondNext(() => apiError(500, "INTERNAL_ERROR"));
    await open();
    await fillAddress(user);
    await pay(user);
    await screen.findByRole("alert");
    await fillAddress(user, { Dirección: "Av. Grau 500" });
    await pay(user);
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).not.toBe(orders.requests[0]!.key);
  });

  it("si cambia el carrito entre el intento y el reintento, la clave es NUEVA", async () => {
    const user = userEvent.setup();
    orders.respondNext(() => apiError(500, "INTERNAL_ERROR"));
    const { router } = await open();
    await fillAddress(user);
    await pay(user);
    await screen.findByRole("alert");
    await router.navigate({ to: "/carrito" });
    await user.selectOptions(await screen.findByLabelText("Cantidad de Clean Code"), "3");
    await router.navigate({ to: "/compra" });
    await readyToPay();
    await pay(user);
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).not.toBe(orders.requests[0]!.key);
  });
});

describe("el primer intento sigue en curso (CHECKOUT_IN_PROGRESS)", () => {
  it("dice «Estamos procesando tu pago» y vuelve a consultar sola, con la misma clave, hasta que termina", async () => {
    const user = userEvent.setup();
    orders.respondNext(
      () => apiError(409, "CHECKOUT_IN_PROGRESS"),
      () => apiError(409, "CHECKOUT_IN_PROGRESS"),
    );
    const { router } = await open();
    await fillAddress(user);
    await pay(user);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/gracias$/));
    expect(orders.requests).toHaveLength(3);
    expect(new Set(orders.requests.map((r) => r.key)).size).toBe(1);
    expect(orders.orderCount).toBe(1);
  });

  it("mientras espera lo dice en el panel", async () => {
    const user = userEvent.setup();
    timing.pollMs = 60;
    orders.respondNext(() => apiError(409, "CHECKOUT_IN_PROGRESS"));
    await open();
    await fillAddress(user);
    await pay(user);
    const status = await screen.findByRole("status", { name: "Estado del pago" });
    await waitFor(() =>
      expect(status.textContent).toContain("Estamos procesando tu pago. Espera un momento."),
    );
  });

  it("si no termina tras varias consultas, pasa a «no pudimos confirmar» con «Reintentar»", async () => {
    const user = userEvent.setup();
    orders.respondNext(
      ...Array.from({ length: 10 }, () => () => apiError(409, "CHECKOUT_IN_PROGRESS")),
    );
    await open();
    await fillAddress(user);
    await pay(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No pudimos confirmar tu pago");
    expect(within(alert).getByRole("button", { name: "Reintentar" })).toBeTruthy();
    expect(orders.requests.length).toBeLessThanOrEqual(1 + timing.maxPolls);
  });
});

describe("el intento anterior falló o cambió algo", () => {
  it.each(["PREVIOUS_ATTEMPT_FAILED", "IDEMPOTENCY_KEY_REUSED"])(
    "%s: reenvía solo con una clave NUEVA",
    async (code) => {
      const user = userEvent.setup();
      orders.respondNext(() => apiError(422, code));
      const { router } = await open();
      await fillAddress(user);
      await pay(user);
      await waitFor(() => expect(router.state.location.pathname).toMatch(/\/gracias$/));
      expect(orders.requests).toHaveLength(2);
      expect(orders.requests[1]!.key).not.toBe(orders.requests[0]!.key);
      expect(orders.requests[1]!.key).toMatch(UUID);
    },
  );

  it("si la clave nueva también falla, no reintenta sin fin: muestra el error", async () => {
    const user = userEvent.setup();
    orders.respondNext(
      () => apiError(422, "PREVIOUS_ATTEMPT_FAILED"),
      () => apiError(422, "PREVIOUS_ATTEMPT_FAILED"),
    );
    await open();
    await fillAddress(user);
    await pay(user);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(orders.requests).toHaveLength(2);
  });
});

describe("el cliente de Ventas todavía no existe (compra justo después de registrarse)", () => {
  it("un 404 se reintenta varias veces mientras el Outbox crea el cliente, siempre con la misma clave", async () => {
    const user = userEvent.setup();
    orders.respondNext(
      () => apiError(404, "NOT_FOUND"),
      () => apiError(404, "NOT_FOUND"),
      () => apiError(404, "NOT_FOUND"),
    );
    const { router } = await open();
    await fillAddress(user);
    await pay(user);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/gracias$/));
    expect(orders.requests).toHaveLength(4);
    expect(new Set(orders.requests.map((r) => r.key)).size).toBe(1);
  });

  it("si el 404 persiste, muestra el error genérico y no reintenta más", async () => {
    const user = userEvent.setup();
    orders.respondNext(...Array.from({ length: 7 }, () => () => apiError(404, "NOT_FOUND")));
    await open();
    await fillAddress(user);
    await pay(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Algo salió mal");
    // la primera petición y 4 reintentos: no se insiste sin fin
    expect(orders.requests).toHaveLength(5);
  });
});

describe("la clave es de cada intento y de cada cuenta", () => {
  it("otra persona del mismo equipo, con la misma dirección y carrito, no reutiliza la clave", async () => {
    const user = userEvent.setup();
    orders.respondNext(() => apiError(500, "INTERNAL_ERROR"));
    const first = await open();
    await fillAddress(user);
    await pay(user);
    await screen.findByRole("alert");
    const key = orders.requests[0]!.key;
    first.unmount();

    const luis = auth.addUser("luis@example.com", "LibroYa-dev-2026");
    localStorage.setItem("libroya.refresh", auth.seedSession("luis@example.com").refreshToken);
    cartStore.getState().add(luis.id, CLEAN);
    await open();
    const luisUser = userEvent.setup();
    await fillAddress(luisUser);
    await pay(luisUser);
    await waitFor(() => expect(orders.requests).toHaveLength(2));
    expect(orders.requests[1]!.key).not.toBe(key);
  });
});

describe("la sesión vence a mitad del pago", () => {
  it("se renueva en segundo plano y el pago se reenvía con la misma clave", async () => {
    const user = userEvent.setup();
    const { router } = await open();
    await fillAddress(user);
    // el token de acceso vence justo antes de pagar
    auth.expireAccessTokens();
    await pay(user);
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/gracias$/));
    expect(auth.refreshCalls.length).toBeGreaterThanOrEqual(1);
    expect(orders.requests.every((r) => r.key === orders.requests[0]!.key)).toBe(true);
    expect(orders.orderCount).toBe(1);
  });
});
