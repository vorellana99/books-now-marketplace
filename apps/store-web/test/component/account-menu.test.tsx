import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeAuth } from "../support/auth.ts";
import {
  API,
  apiError,
  book,
  bookNumber,
  detailHandler,
  page,
  searchHandler,
} from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
    detailHandler(() => book()),
  );
});

const signedIn = () => {
  const login = auth.seedSession();
  localStorage.setItem("libroya.refresh", login.refreshToken);
  return login;
};
const header = () => screen.getByRole("banner");
const accountButton = () => within(header()).findByRole("button", { name: "Mi cuenta" });

// El menú se abre con el teclado: es como lo usa quien no usa el ratón, y no depende de los eventos de puntero que jsdom no trae
const openMenu = async (user: ReturnType<typeof userEvent.setup>) => {
  const button = await accountButton();
  button.focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menu");
};

describe("cabecera sin sesión", () => {
  it("ofrece Entrar y Crear cuenta, y no muestra el menú de la cuenta", async () => {
    await renderApp("/");
    await screen.findByRole("heading", { name: "Libros" });
    const banner = header();
    await waitFor(() => expect(within(banner).getByRole("link", { name: "Entrar" })).toBeTruthy());
    expect(within(banner).getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe(
      "/ingresar",
    );
    expect(within(banner).getByRole("link", { name: "Crear cuenta" }).getAttribute("href")).toBe(
      "/registro",
    );
    expect(within(banner).queryByRole("button", { name: "Mi cuenta" })).toBeNull();
  });

  it("mientras se recupera la sesión no muestra ni Entrar ni la cuenta (no parpadea)", async () => {
    signedIn();
    server.use(
      http.post(API("/auth/refresh"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 120));
        return apiError(401, "INVALID_REFRESH_TOKEN");
      }),
    );
    await renderApp("/");
    expect(within(header()).queryByRole("link", { name: "Entrar" })).toBeNull();
    expect(within(header()).queryByRole("button", { name: "Mi cuenta" })).toBeNull();
    await waitFor(() =>
      expect(within(header()).getByRole("link", { name: "Entrar" })).toBeTruthy(),
    );
  });
});

describe("cabecera con sesión", () => {
  it("muestra el menú de la cuenta en lugar de Entrar", async () => {
    signedIn();
    await renderApp("/");
    expect(await accountButton()).toBeTruthy();
    expect(within(header()).queryByRole("link", { name: "Entrar" })).toBeNull();
    expect(within(header()).queryByRole("link", { name: "Crear cuenta" })).toBeNull();
  });

  it("el menú tiene el correo y Cerrar sesión, y se navega con el teclado", async () => {
    const user = userEvent.setup();
    signedIn();
    await renderApp("/");
    const menu = await openMenu(user);
    expect(within(menu).getByText("ana@example.com")).toBeTruthy();
    expect(within(menu).getByRole("menuitem", { name: "Cerrar sesión" })).toBeTruthy();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(document.activeElement).toBe(await accountButton());
  });

  it("no tiene violaciones de accesibilidad, con el menú abierto", async () => {
    const user = userEvent.setup();
    signedIn();
    await renderApp("/");
    await openMenu(user);
    await expectNoA11yViolations(document.body);
  });
});

describe("cerrar sesión", () => {
  it("llama a la API, borra los dos tokens, vacía la caché y lleva al catálogo como visitante", async () => {
    const user = userEvent.setup();
    const login = signedIn();
    const { router, queryClient } = await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Clean Code", level: 1 });
    queryClient.setQueryData(["orders", "mine"], { items: [] });
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    const stored = auth.refreshCalls[0] ? auth.liveRefreshTokens() : [login.refreshToken];
    expect(auth.logoutCalls).toHaveLength(1);
    expect(stored).not.toContain(auth.logoutCalls[0] as string);
    expect(localStorage.getItem("libroya.refresh")).toBeNull();
    expect(queryClient.getQueryData(["orders", "mine"])).toBeUndefined();
    await waitFor(() =>
      expect(within(header()).getByRole("link", { name: "Entrar" })).toBeTruthy(),
    );
    expect(within(header()).queryByRole("button", { name: "Mi cuenta" })).toBeNull();
  });

  it.each([
    ["un 500", () => apiError(500, "INTERNAL_ERROR")],
    ["la red caída", () => HttpResponse.error()],
  ])("borra la sesión local aunque la API falle (%s)", async (_caso, respond) => {
    const user = userEvent.setup();
    server.use(http.post(API("/auth/logout"), respond));
    signedIn();
    const { router } = await renderApp("/");
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(localStorage.getItem("libroya.refresh")).toBeNull());
    await waitFor(() =>
      expect(within(header()).getByRole("link", { name: "Entrar" })).toBeTruthy(),
    );
    expect(router.state.location.pathname).toBe("/");
  });

  it("desde una pantalla con sesión lleva al catálogo, no a iniciar sesión", async () => {
    const user = userEvent.setup();
    signedIn();
    const { router } = await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Estamos armando el carrito" });
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(router.state.location.search).toEqual({});
  });

  it("el carrito guardado se conserva (DP-04)", async () => {
    const user = userEvent.setup();
    signedIn();
    localStorage.setItem(
      "libroya.cart",
      JSON.stringify({ "u-1": [{ isbn: "9780132350884", quantity: 2 }] }),
    );
    await renderApp("/");
    await openMenu(user);
    await user.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(localStorage.getItem("libroya.refresh")).toBeNull());
    expect(localStorage.getItem("libroya.cart")).toContain("9780132350884");
  });
});

describe("menú móvil", () => {
  it("sin sesión ofrece Entrar y Crear cuenta", async () => {
    const user = userEvent.setup();
    await renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Abrir menú" }));
    const dialog = await screen.findByRole("dialog", { name: "Menú" });
    expect(within(dialog).getByRole("link", { name: "Entrar" }).getAttribute("href")).toBe(
      "/ingresar",
    );
    expect(within(dialog).getByRole("link", { name: "Crear cuenta" }).getAttribute("href")).toBe(
      "/registro",
    );
  });

  it("con sesión muestra el correo y Cerrar sesión, que cierra la sesión y el menú", async () => {
    const user = userEvent.setup();
    signedIn();
    const { router } = await renderApp("/");
    await within(header()).findByRole("button", { name: "Mi cuenta" });
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = await screen.findByRole("dialog", { name: "Menú" });
    expect(within(dialog).getByText("ana@example.com")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(localStorage.getItem("libroya.refresh")).toBeNull());
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Menú" })).toBeNull());
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("otra pestaña cierra la sesión", () => {
  it("esta pestaña queda sin sesión, vacía su caché y, si estaba en una pantalla con sesión, pide entrar", async () => {
    signedIn();
    const { router, queryClient } = await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Estamos armando el carrito" });
    queryClient.setQueryData(["orders", "mine"], { items: [] });

    localStorage.removeItem("libroya.refresh");
    window.dispatchEvent(new StorageEvent("storage", { key: "libroya.refresh", newValue: null }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/carrito" });
    expect(queryClient.getQueryData(["orders", "mine"])).toBeUndefined();
  });

  it("en una pantalla pública solo cambia la cabecera", async () => {
    signedIn();
    const { router } = await renderApp("/");
    await within(header()).findByRole("button", { name: "Mi cuenta" });

    localStorage.removeItem("libroya.refresh");
    window.dispatchEvent(new StorageEvent("storage", { key: "libroya.refresh", newValue: null }));

    await waitFor(() =>
      expect(within(header()).getByRole("link", { name: "Entrar" })).toBeTruthy(),
    );
    expect(router.state.location.pathname).toBe("/");
  });
});
