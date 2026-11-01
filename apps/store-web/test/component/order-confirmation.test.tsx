import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { timing } from "@/features/cart/timing.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import {
  FakeOrders,
  orderDetail,
  orderDetailHandler,
  quoteFor,
  quoteHandler,
} from "../support/orders.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const ID = "0b6f2f0e-6f0e-4b1e-9a55-3f1f5a0c1d11";
const CLEAN: CartBook = {
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  unitPrice: { amount: "90.00", currency: "PEN" },
};
const PRICES = { [CLEAN.isbn]: "90.00" };

let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
  );
  auth.signIn();
});

describe("PA-07 Confirmación", () => {
  it("da las gracias, avisa del email y muestra el número de pedido", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(
      await screen.findByRole("heading", { name: "¡Gracias por tu compra!", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Te enviamos un email de confirmación.")).toBeTruthy();
    // El número son los primeros 8 caracteres del id, en mayúsculas (wireframe PA-07)
    expect(screen.getByText("#0B6F2F0E")).toBeTruthy();
  });

  it("el número de pedido se puede copiar completo", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    const user = userEvent.setup();
    await renderApp(`/pedidos/${ID}/gracias`);
    await user.click(
      await screen.findByRole("button", { name: "Copiar el número de pedido completo" }),
    );
    expect(await navigator.clipboard.readText()).toBe(ID);
    expect(await screen.findByText("Copiado")).toBeTruthy();
  });

  it("lista los libros con su cantidad y su precio, y el total cobrado con su moneda", async () => {
    server.use(
      orderDetailHandler(() =>
        orderDetail({
          id: ID,
          charged: { amount: "200.00", currency: "PEN" },
          lines: [
            {
              isbn: "9780132350884",
              title: "Clean Code",
              unitPrice: { amount: "90.00", currency: "PEN" },
              quantity: 2,
            },
            {
              isbn: "9780321125217",
              title: "Domain-Driven Design",
              unitPrice: { amount: "120.00", currency: "PEN" },
              quantity: 1,
            },
          ],
        }),
      ),
    );
    await renderApp(`/pedidos/${ID}/gracias`);
    const list = await screen.findByRole("list", { name: "Libros del pedido" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText("Clean Code")).toBeTruthy();
    expect(within(items[0]!).getByText(/2 ×/)).toBeTruthy();
    expect(within(items[0]!).getByText("S/ 90.00", { exact: false })).toBeTruthy();
    expect(within(items[1]!).getByText("Domain-Driven Design")).toBeTruthy();
    expect(screen.getByText("Total cobrado")).toBeTruthy();
    expect(screen.getByText("S/ 200.00")).toBeTruthy();
  });

  it("muestra el total que dice la API aunque no sea la suma de las líneas (la tienda no calcula)", async () => {
    // cotizado 100.00 (90.00 + envío), cobrado 95.00: gana lo cobrado
    server.use(
      orderDetailHandler(() =>
        orderDetail({ id: ID, charged: { amount: "95.00", currency: "PEN" } }),
      ),
    );
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(await screen.findByText("S/ 95.00")).toBeTruthy();
    expect(screen.queryByText("S/ 100.00")).toBeNull();
  });

  it("un pedido en dólares se muestra en dólares", async () => {
    server.use(
      orderDetailHandler(() =>
        orderDetail({
          id: ID,
          charged: { amount: "43.00", currency: "USD" },
          lines: [
            {
              isbn: "9780132350884",
              title: "Clean Code",
              unitPrice: { amount: "40.00", currency: "USD" },
              quantity: 1,
            },
          ],
        }),
      ),
    );
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(await screen.findByText("43.00 USD")).toBeTruthy();
  });

  it("dice adónde se envía, cuando el pedido trae la dirección", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    await renderApp(`/pedidos/${ID}/gracias`);
    const region = await screen.findByRole("region", { name: "Envío" });
    expect(within(region).getByText(/María Quispe/)).toBeTruthy();
    expect(within(region).getByText(/Jr\. Ucayali 150, Dpto 2/)).toBeTruthy();
    expect(within(region).getByText(/Barranco/)).toBeTruthy();
  });

  it("un pedido sin dirección (anterior a ella) no muestra el bloque de envío", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID, shippingAddress: null })));
    await renderApp(`/pedidos/${ID}/gracias`);
    await screen.findByRole("heading", { name: "¡Gracias por tu compra!" });
    expect(screen.queryByRole("region", { name: "Envío" })).toBeNull();
  });

  it("recargar muestra lo mismo: el pedido se lee de la API cada vez", async () => {
    let reads = 0;
    server.use(
      orderDetailHandler(() => {
        reads += 1;
        return orderDetail({ id: ID, charged: { amount: "95.00", currency: "PEN" } });
      }),
    );
    const first = await renderApp(`/pedidos/${ID}/gracias`);
    await screen.findByText("S/ 95.00");
    first.unmount();
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(await screen.findByText("S/ 95.00")).toBeTruthy();
    expect(screen.getByText("#0B6F2F0E")).toBeTruthy();
    expect(reads).toBe(2);
  });

  it("pide a la API el pedido de la URL con el token de acceso", async () => {
    let authorization: string | null = null;
    let asked = "";
    server.use(
      http.get(API("/orders/:id"), ({ request, params }) => {
        authorization = request.headers.get("Authorization");
        asked = String(params.id);
        return HttpResponse.json(orderDetail({ id: ID }));
      }),
    );
    await renderApp(`/pedidos/${ID}/gracias`);
    await screen.findByRole("heading", { name: "¡Gracias por tu compra!" });
    expect(asked).toBe(ID);
    expect(authorization).toMatch(/^Bearer /);
  });

  it("«Ver mis pedidos» lleva a PA-08 y «Seguir comprando» al catálogo", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    const user = userEvent.setup();
    const { router } = await renderApp(`/pedidos/${ID}/gracias`);
    await screen.findByRole("heading", { name: "¡Gracias por tu compra!" });
    expect(screen.getByRole("link", { name: "Ver mis pedidos" }).getAttribute("href")).toBe(
      "/pedidos",
    );
    expect(screen.getByRole("link", { name: "Seguir comprando" }).getAttribute("href")).toBe("/");
    await user.click(screen.getByRole("link", { name: "Seguir comprando" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("el título de la pestaña dice que el pedido está confirmado", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    await renderApp(`/pedidos/${ID}/gracias`);
    await screen.findByRole("heading", { name: "¡Gracias por tu compra!" });
    await waitFor(() => expect(document.title).toBe("Pedido confirmado · LibroYa"));
  });

  it("mientras llega el pedido avisa que está cargando", async () => {
    const gate = deferred();
    server.use(
      orderDetailHandler(async () => {
        await gate.promise;
        return orderDetail({ id: ID });
      }),
    );
    await renderApp(`/pedidos/${ID}/gracias`);
    expect((await screen.findByRole("status")).textContent).toMatch(/Cargando tu pedido/);
    expect(screen.queryByRole("heading", { name: "¡Gracias por tu compra!" })).toBeNull();
    gate.release();
    expect(await screen.findByRole("heading", { name: "¡Gracias por tu compra!" })).toBeTruthy();
  });

  it("no tiene violaciones de accesibilidad", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    const { container } = await renderApp(`/pedidos/${ID}/gracias`);
    await screen.findByRole("heading", { name: "¡Gracias por tu compra!" });
    await expectNoA11yViolations(container);
  });
});

describe("PA-07 Confirmación: lo que sale mal", () => {
  it("un pedido que no existe, o que es de otra persona (404), dice «No encontramos este pedido.»", async () => {
    server.use(orderDetailHandler(() => apiError(404, "NOT_FOUND")));
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(
      await screen.findByRole("heading", { name: "No encontramos este pedido.", level: 1 }),
    ).toBeTruthy();
    expect(screen.queryByText("¡Gracias por tu compra!")).toBeNull();
    expect(screen.getByRole("link", { name: "Ver mis pedidos" }).getAttribute("href")).toBe(
      "/pedidos",
    );
    expect(screen.getByRole("link", { name: "Seguir comprando" }).getAttribute("href")).toBe("/");
  });

  it("un número de pedido mal formado (400) se ve igual que uno que no existe", async () => {
    server.use(orderDetailHandler(() => apiError(400, "BAD_REQUEST")));
    await renderApp("/pedidos/esto-no-es-un-uuid/gracias");
    expect(
      await screen.findByRole("heading", { name: "No encontramos este pedido." }),
    ).toBeTruthy();
  });

  it("un error del servidor ofrece reintentar, con el código de soporte, y al reintentar muestra el pedido", async () => {
    let fail = true;
    server.use(
      orderDetailHandler(() =>
        fail ? apiError(500, "INTERNAL_ERROR", "req-5678") : orderDetail({ id: ID }),
      ),
    );
    const user = userEvent.setup();
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByText("req-5678")).toBeTruthy();
    expect(screen.queryByText("¡Gracias por tu compra!")).toBeNull();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "¡Gracias por tu compra!" })).toBeTruthy();
  });

  it("una red caída no deja la pantalla en blanco", async () => {
    server.use(http.get(API("/orders/:id"), () => HttpResponse.error()));
    await renderApp(`/pedidos/${ID}/gracias`);
    expect(await screen.findByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("sin sesión lleva a «Entrar» y, al entrar, vuelve a la confirmación", async () => {
    localStorage.clear();
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    const { router } = await renderApp(`/pedidos/${ID}/gracias`);
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({ returnTo: `/pedidos/${ID}/gracias` });
  });
});

describe("PA-07 Confirmación: al terminar una compra", () => {
  const TITLES = { [CLEAN.isbn]: "Clean Code" };

  it("tras pagar, la confirmación muestra el pedido creado, con lo realmente cobrado y sus libros", async () => {
    timing.pollMs = 5;
    const orders = new FakeOrders(PRICES, (token) => auth.isAccessValid(token), TITLES);
    server.use(
      ...orders.handlers(),
      http.get(API("/books/:isbn"), () =>
        HttpResponse.json(book({ ...CLEAN, price: CLEAN.unitPrice })),
      ),
      quoteHandler((items) => quoteFor(items, PRICES)),
    );
    const userId = auth.users.get("ana@example.com")!.id;
    cartStore.getState().add(userId, CLEAN);
    const user = userEvent.setup();
    const { router } = await renderApp("/compra");
    const payButton = await screen.findByRole("button", { name: /^Pagar S\// });
    await waitFor(() => expect((payButton as HTMLButtonElement).disabled).toBe(false));
    for (const [label, value] of Object.entries({
      Destinatario: "María Quispe",
      Teléfono: "+51 987 654 321",
      Dirección: "Jr. Ucayali 150, Dpto 2",
      Distrito: "Barranco",
      Provincia: "Lima",
      Departamento: "Lima",
    })) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.click(payButton);
    expect(await screen.findByRole("heading", { name: "¡Gracias por tu compra!" })).toBeTruthy();
    const created = [...orders.created.values()][0]!;
    expect(router.state.location.pathname).toBe(`/pedidos/${created.orderId}/gracias`);
    expect(screen.getByText(`#${created.orderId.slice(0, 8).toUpperCase()}`)).toBeTruthy();
    expect(screen.getByRole("list", { name: "Libros del pedido" }).textContent).toContain(
      "Clean Code",
    );
    expect(screen.getByText("S/ 100.00")).toBeTruthy();
    expect(cartStore.getState().linesOf(userId)).toEqual([]);
    expect(orders.detailRequests).toBeGreaterThan(0);
  });
});
