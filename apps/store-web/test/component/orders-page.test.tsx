import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import { historyItem, historyPage, myOrdersHandler } from "../support/orders.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const line = (isbn: string, title: string, quantity: number, amount = "90.00") => ({
  isbn,
  title,
  quantity,
  unitPrice: { amount, currency: "PEN" as const },
});
const ID_A = "0b6f2f0e-6f0e-4b1e-9a55-3f1f5a0c1d11";
const ID_B = "a1c2d3e4-0000-4000-8000-000000000002";
const ID_C = "c3c3c3c3-0000-4000-8000-000000000003";

let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
  );
  auth.signIn();
});

describe("PA-08 Mis pedidos", () => {
  it("muestra cada pedido en el orden de la API: número, fecha de Lima, libros, total cobrado y estado", async () => {
    server.use(
      myOrdersHandler(() =>
        historyPage([
          historyItem({
            id: ID_A,
            createdAt: "2026-10-28T10:00:00.000Z",
            charged: { amount: "190.00", currency: "PEN" },
            lines: [
              line("9780132350884", "Clean Code", 2),
              line("9780321125217", "DDD", 1, "120.00"),
            ],
          }),
          historyItem({
            id: ID_B,
            createdAt: "2026-10-27T23:30:00.000Z",
            charged: { amount: "100.00", currency: "PEN" },
          }),
        ]),
      ),
    );
    await renderApp("/pedidos");
    expect(await screen.findByRole("heading", { name: "Mis pedidos", level: 1 })).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("#0B6F2F0E")).toBeTruthy();
    // 10:00 UTC son las 05:00 en Lima
    expect(within(rows[0]!).getByText("28 oct 2026, 05:00")).toBeTruthy();
    expect(within(rows[0]!).getByText("3 libros")).toBeTruthy();
    expect(within(rows[0]!).getByText("S/ 190.00")).toBeTruthy();
    expect(within(rows[0]!).getByText("Realizado")).toBeTruthy();
    expect(within(rows[1]!).getByText("#A1C2D3E4")).toBeTruthy();
    // 23:30 UTC del 27 son las 18:30 del 27 en Lima
    expect(within(rows[1]!).getByText("27 oct 2026, 18:30")).toBeTruthy();
    expect(within(rows[1]!).getByText("1 libro")).toBeTruthy();
  });

  it("cada pedido lleva a su detalle", async () => {
    server.use(myOrdersHandler(() => historyPage([historyItem({ id: ID_A })])));
    await renderApp("/pedidos");
    const link = await screen.findByRole("link", { name: /#0B6F2F0E/ });
    expect(link.getAttribute("href")).toBe(`/pedidos/${ID_A}`);
  });

  it("la primera petición no lleva cursor y pide de 20 en 20, con el token de acceso", async () => {
    let seen:
      | { cursor: string | null; limit: string | null; authorization: string | null }
      | undefined;
    server.use(
      http.get(API("/me/orders"), ({ request }) => {
        const url = new URL(request.url);
        seen = {
          cursor: url.searchParams.get("cursor"),
          limit: url.searchParams.get("limit"),
          authorization: request.headers.get("Authorization"),
        };
        return HttpResponse.json(historyPage([historyItem({ id: ID_A })]));
      }),
    );
    await renderApp("/pedidos");
    await screen.findByRole("list", { name: "Pedidos" });
    expect(seen?.cursor).toBeNull();
    expect(seen?.limit).toBe("20");
    expect(seen?.authorization).toMatch(/^Bearer /);
  });

  it("sin siguiente página no hay «Cargar más»", async () => {
    server.use(myOrdersHandler(() => historyPage([historyItem({ id: ID_A })], null)));
    await renderApp("/pedidos");
    await screen.findByRole("list", { name: "Pedidos" });
    expect(screen.queryByRole("button", { name: "Cargar más pedidos" })).toBeNull();
  });

  it("«Cargar más» pide la página siguiente con el nextCursor TAL CUAL y la agrega debajo", async () => {
    const cursors: (string | null)[] = [];
    const OPAQUE = "eyJ0IjoiMjAyNi0xMC0yN1QyMzozMDowMC4wMDBaIiwiaSI6ImEifQ==";
    server.use(
      myOrdersHandler((url) => {
        const cursor = url.searchParams.get("cursor");
        cursors.push(cursor);
        return cursor === null
          ? historyPage([historyItem({ id: ID_A }), historyItem({ id: ID_B })], OPAQUE)
          : historyPage([historyItem({ id: ID_C })], null);
      }),
    );
    const user = userEvent.setup();
    await renderApp("/pedidos");
    await screen.findByRole("list", { name: "Pedidos" });
    await user.click(screen.getByRole("button", { name: "Cargar más pedidos" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole("listitem"),
      ).toHaveLength(3),
    );
    expect(cursors).toEqual([null, OPAQUE]);
    const ids = within(screen.getByRole("list", { name: "Pedidos" }))
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(ids).toEqual([`/pedidos/${ID_A}`, `/pedidos/${ID_B}`, `/pedidos/${ID_C}`]);
    expect(screen.queryByRole("button", { name: "Cargar más pedidos" })).toBeNull();
  });

  it("mientras llega la página siguiente el botón avisa y no se puede pulsar dos veces", async () => {
    const gate = deferred();
    let calls = 0;
    server.use(
      myOrdersHandler(async (url) => {
        calls += 1;
        if (url.searchParams.get("cursor") === null) {
          return historyPage([historyItem({ id: ID_A })], "c1");
        }
        await gate.promise;
        return historyPage([historyItem({ id: ID_B })], null);
      }),
    );
    const user = userEvent.setup();
    await renderApp("/pedidos");
    await user.click(await screen.findByRole("button", { name: "Cargar más pedidos" }));
    const busy = await screen.findByRole("button", { name: "Cargando…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await user.click(busy);
    expect(calls).toBe(2);
    gate.release();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Cargando…" })).toBeNull());
  });

  it("si falla la página siguiente conserva lo ya cargado y ofrece reintentar", async () => {
    let fail = true;
    server.use(
      myOrdersHandler((url) => {
        if (url.searchParams.get("cursor") === null) {
          return historyPage([historyItem({ id: ID_A })], "c1");
        }
        return fail
          ? apiError(500, "INTERNAL_ERROR")
          : historyPage([historyItem({ id: ID_B })], null);
      }),
    );
    const user = userEvent.setup();
    await renderApp("/pedidos");
    await user.click(await screen.findByRole("button", { name: "Cargar más pedidos" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole("listitem"),
    ).toHaveLength(1);
    fail = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "Pedidos" })).getAllByRole("listitem"),
      ).toHaveLength(2),
    );
  });

  it("sin pedidos muestra el estado vacío con un enlace al catálogo", async () => {
    server.use(myOrdersHandler(() => historyPage([])));
    await renderApp("/pedidos");
    expect(await screen.findByText("Aún no has hecho ninguna compra.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver libros" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("list", { name: "Pedidos" })).toBeNull();
  });

  it("un error del servidor ofrece reintentar, con el código de soporte", async () => {
    let fail = true;
    server.use(
      myOrdersHandler(() =>
        fail ? apiError(500, "INTERNAL_ERROR", "req-9") : historyPage([historyItem({ id: ID_A })]),
      ),
    );
    const user = userEvent.setup();
    await renderApp("/pedidos");
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByText("req-9")).toBeTruthy();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("list", { name: "Pedidos" })).toBeTruthy();
  });

  it("una cuenta de administrador (403) dice que no tiene pedidos, sin reintentar", async () => {
    server.use(myOrdersHandler(() => apiError(403, "FORBIDDEN")));
    await renderApp("/pedidos");
    expect(
      await screen.findByText(
        "Esta cuenta no tiene pedidos: solo las cuentas de comprador compran.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reintentar" })).toBeNull();
  });

  it("mientras carga avisa y muestra un esqueleto", async () => {
    const gate = deferred();
    server.use(
      myOrdersHandler(async () => {
        await gate.promise;
        return historyPage([historyItem({ id: ID_A })]);
      }),
    );
    await renderApp("/pedidos");
    expect((await screen.findByRole("status")).textContent).toMatch(/Cargando tus pedidos/);
    expect(screen.queryByRole("list", { name: "Pedidos" })).toBeNull();
    gate.release();
    expect(await screen.findByRole("list", { name: "Pedidos" })).toBeTruthy();
  });

  it("el título de la pestaña es «Mis pedidos · LibroYa»", async () => {
    server.use(myOrdersHandler(() => historyPage([historyItem({ id: ID_A })])));
    await renderApp("/pedidos");
    await screen.findByRole("list", { name: "Pedidos" });
    await waitFor(() => expect(document.title).toBe("Mis pedidos · LibroYa"));
  });

  it("sin sesión lleva a «Entrar» y vuelve a /pedidos", async () => {
    localStorage.clear();
    const { router } = await renderApp("/pedidos");
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/pedidos" });
  });

  it("no tiene violaciones de accesibilidad", async () => {
    server.use(
      myOrdersHandler(() =>
        historyPage([historyItem({ id: ID_A }), historyItem({ id: ID_B })], "c1"),
      ),
    );
    const { container } = await renderApp("/pedidos");
    await screen.findByRole("list", { name: "Pedidos" });
    await expectNoA11yViolations(container);
  });
});

describe("«Mis pedidos» en la cabecera", () => {
  it("el menú de la cuenta lleva a /pedidos", async () => {
    server.use(myOrdersHandler(() => historyPage([])));
    const user = userEvent.setup();
    const { router } = await renderApp("/");
    const button = await screen.findByRole("button", { name: "Mi cuenta" });
    button.focus();
    await user.keyboard("{Enter}");
    const item = await screen.findByRole("menuitem", { name: "Mis pedidos" });
    expect(item.closest("a")?.getAttribute("href") ?? item.getAttribute("href")).toBe("/pedidos");
    await user.click(item);
    await waitFor(() => expect(router.state.location.pathname).toBe("/pedidos"));
  });

  it("el menú móvil también lo ofrece", async () => {
    const user = userEvent.setup();
    await renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Abrir menú" }));
    const link = await screen.findByRole("link", { name: "Mis pedidos" });
    expect(link.getAttribute("href")).toBe("/pedidos");
  });

  it("sin sesión no aparece", async () => {
    localStorage.clear();
    const user = userEvent.setup();
    await renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Abrir menú" }));
    await screen.findByRole("link", { name: "Entrar" });
    expect(screen.queryByRole("link", { name: "Mis pedidos" })).toBeNull();
  });
});
