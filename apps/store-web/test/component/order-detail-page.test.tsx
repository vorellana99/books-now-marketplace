import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import {
  historyItem,
  historyPage,
  myOrdersHandler,
  orderDetail,
  orderDetailHandler,
} from "../support/orders.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const ID = "0b6f2f0e-6f0e-4b1e-9a55-3f1f5a0c1d11";

let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
  );
  auth.signIn();
});

describe("PA-09 Detalle del pedido", () => {
  it("muestra el número, el estado, el total cobrado y las líneas con el precio de la compra", async () => {
    server.use(
      orderDetailHandler(() =>
        orderDetail({
          id: ID,
          charged: { amount: "190.00", currency: "PEN" },
          lines: [
            {
              isbn: "9780132350884",
              title: "Clean Code",
              unitPrice: { amount: "40.00", currency: "PEN" },
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
    await renderApp(`/pedidos/${ID}`);
    expect(
      await screen.findByRole("heading", { name: /^Pedido #0B6F2F0E$/, level: 1 }),
    ).toBeTruthy();
    expect(screen.getByText("Realizado")).toBeTruthy();
    const items = within(screen.getByRole("list", { name: "Libros del pedido" })).getAllByRole(
      "listitem",
    );
    expect(items).toHaveLength(2);
    // el precio unitario es el de la compra (40.00), no el actual del catálogo
    expect(within(items[0]!).getByText("Clean Code")).toBeTruthy();
    expect(within(items[0]!).getByText("2 × S/ 40.00")).toBeTruthy();
    expect(within(items[1]!).getByText("1 × S/ 120.00")).toBeTruthy();
    expect(screen.getByText("Total cobrado")).toBeTruthy();
    expect(screen.getByText("S/ 190.00")).toBeTruthy();
  });

  it("no calcula nada: el total es el cobrado aunque no sea la suma de las líneas", async () => {
    server.use(
      orderDetailHandler(() =>
        orderDetail({ id: ID, charged: { amount: "95.00", currency: "PEN" } }),
      ),
    );
    await renderApp(`/pedidos/${ID}`);
    expect(await screen.findByText("S/ 95.00")).toBeTruthy();
    expect(screen.queryByText("S/ 90.00", { selector: "span.text-xl" })).toBeNull();
  });

  it("con dirección: muestra la sección «Envío» con destinatario, teléfono, dirección y referencia", async () => {
    server.use(
      orderDetailHandler(() =>
        orderDetail({
          id: ID,
          shippingAddress: {
            recipient: "María Quispe",
            phone: "+51 987 654 321",
            line1: "Jr. Ucayali 150, Dpto 2",
            district: "Barranco",
            province: "Lima",
            department: "Lima",
            reference: "Casa de rejas verdes",
          },
        }),
      ),
    );
    await renderApp(`/pedidos/${ID}`);
    const region = await screen.findByRole("region", { name: "Envío" });
    expect(within(region).getByText(/María Quispe/)).toBeTruthy();
    expect(within(region).getByText(/\+51 987 654 321/)).toBeTruthy();
    expect(within(region).getByText(/Jr\. Ucayali 150, Dpto 2, Barranco, Lima, Lima/)).toBeTruthy();
    expect(within(region).getByText(/Casa de rejas verdes/)).toBeTruthy();
  });

  it("sin dirección (`shippingAddress: null`, un pedido anterior a ella) no hay sección de envío", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID, shippingAddress: null })));
    await renderApp(`/pedidos/${ID}`);
    await screen.findByRole("heading", { name: /^Pedido #/ });
    expect(screen.queryByRole("region", { name: "Envío" })).toBeNull();
    expect(screen.queryByText("Envío")).toBeNull();
  });

  it("el id completo se puede copiar", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    const user = userEvent.setup();
    await renderApp(`/pedidos/${ID}`);
    await user.click(
      await screen.findByRole("button", { name: "Copiar el número de pedido completo" }),
    );
    expect(await navigator.clipboard.readText()).toBe(ID);
  });

  it("tiene un enlace para volver a «Mis pedidos»", async () => {
    server.use(
      orderDetailHandler(() => orderDetail({ id: ID })),
      myOrdersHandler(() => historyPage([])),
    );
    const user = userEvent.setup();
    const { router } = await renderApp(`/pedidos/${ID}`);
    const back = await screen.findByRole("link", { name: "Volver a mis pedidos" });
    expect(back.getAttribute("href")).toBe("/pedidos");
    await user.click(back);
    await waitFor(() => expect(router.state.location.pathname).toBe("/pedidos"));
  });

  it("desde la lista se abre el pedido elegido", async () => {
    const OTHER = "a1c2d3e4-0000-4000-8000-000000000002";
    server.use(
      myOrdersHandler(() => historyPage([historyItem({ id: ID }), historyItem({ id: OTHER })])),
      orderDetailHandler((id) =>
        orderDetail({
          id,
          charged: { amount: id === OTHER ? "77.00" : "100.00", currency: "PEN" },
        }),
      ),
    );
    const user = userEvent.setup();
    const { router } = await renderApp("/pedidos");
    await user.click(await screen.findByRole("link", { name: /#A1C2D3E4/ }));
    expect(await screen.findByRole("heading", { name: "Pedido #A1C2D3E4" })).toBeTruthy();
    expect(router.state.location.pathname).toBe(`/pedidos/${OTHER}`);
    expect(screen.getByText("S/ 77.00")).toBeTruthy();
  });

  it("pide a la API el pedido de la URL con el token de acceso", async () => {
    let seen: { id: string; authorization: string | null } | undefined;
    server.use(
      http.get(API("/orders/:id"), ({ params, request }) => {
        seen = { id: String(params.id), authorization: request.headers.get("Authorization") };
        return HttpResponse.json(orderDetail({ id: ID }));
      }),
    );
    await renderApp(`/pedidos/${ID}`);
    await screen.findByRole("heading", { name: /^Pedido #/ });
    expect(seen?.id).toBe(ID);
    expect(seen?.authorization).toMatch(/^Bearer /);
  });

  it("el título de la pestaña lleva el número del pedido", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    await renderApp(`/pedidos/${ID}`);
    await screen.findByRole("heading", { name: /^Pedido #/ });
    await waitFor(() => expect(document.title).toBe("Pedido #0B6F2F0E · LibroYa"));
  });

  it("mientras llega avisa que está cargando", async () => {
    const gate = deferred();
    server.use(
      orderDetailHandler(async () => {
        await gate.promise;
        return orderDetail({ id: ID });
      }),
    );
    await renderApp(`/pedidos/${ID}`);
    expect((await screen.findByRole("status")).textContent).toMatch(/Cargando tu pedido/);
    gate.release();
    expect(await screen.findByRole("heading", { name: /^Pedido #/ })).toBeTruthy();
  });

  it("no tiene violaciones de accesibilidad", async () => {
    server.use(orderDetailHandler(() => orderDetail({ id: ID })));
    const { container } = await renderApp(`/pedidos/${ID}`);
    await screen.findByRole("heading", { name: /^Pedido #/ });
    await expectNoA11yViolations(container);
  });
});

describe("PA-09 Detalle del pedido: no encontrado y errores", () => {
  it.each([
    ["un pedido que no es suyo o no existe (404)", 404, "NOT_FOUND"],
    ["un id que no es un UUID (400)", 400, "VALIDATION_ERROR"],
  ])("%s dice lo mismo: «No encontramos este pedido.»", async (_name, status, code) => {
    server.use(orderDetailHandler(() => apiError(status, code)));
    await renderApp(`/pedidos/${ID}`);
    expect(
      await screen.findByRole("heading", { name: "No encontramos este pedido.", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver mis pedidos" }).getAttribute("href")).toBe(
      "/pedidos",
    );
    expect(screen.getByRole("link", { name: "Seguir comprando" }).getAttribute("href")).toBe("/");
    expect(screen.queryByText("Total cobrado")).toBeNull();
    await waitFor(() => expect(document.title).toBe("Pedido no encontrado · LibroYa"));
  });

  it("una URL con un id que no es UUID llega a la API y se ve como no encontrado", async () => {
    server.use(orderDetailHandler(() => apiError(400, "VALIDATION_ERROR")));
    await renderApp("/pedidos/esto-no-es-un-uuid");
    expect(
      await screen.findByRole("heading", { name: "No encontramos este pedido." }),
    ).toBeTruthy();
  });

  it("un error del servidor ofrece reintentar y, al reintentar, muestra el pedido", async () => {
    let fail = true;
    server.use(
      orderDetailHandler(() =>
        fail ? apiError(500, "INTERNAL_ERROR", "req-77") : orderDetail({ id: ID }),
      ),
    );
    const user = userEvent.setup();
    await renderApp(`/pedidos/${ID}`);
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByText("req-77")).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: /^Pedido #/ })).toBeTruthy();
  });

  it("sin sesión lleva a «Entrar» y vuelve al pedido", async () => {
    localStorage.clear();
    const { router } = await renderApp(`/pedidos/${ID}`);
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({ returnTo: `/pedidos/${ID}` });
  });
});
