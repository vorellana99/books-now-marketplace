import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { FakeAuth } from "../support/auth.ts";
import { API, book, bookNumber, detailHandler, page, searchHandler } from "../support/books.ts";
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
  localStorage.setItem("libroya.refresh", auth.seedSession().refreshToken);
};

describe("ruta con sesión, sin sesión", () => {
  it("va a /ingresar guardando la ruta de origen", async () => {
    const { router } = await renderApp("/carrito");
    expect(await screen.findByRole("heading", { name: "Entra a tu cuenta" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/ingresar");
    expect(router.state.location.search).toMatchObject({ returnTo: "/carrito" });
  });

  it("tras entrar vuelve a donde estaba", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/carrito"));
    expect(await screen.findByRole("heading", { name: "Tu carrito" })).toBeTruthy();
  });

  it("sin token de refresco no avisa que terminó una sesión: nunca hubo", async () => {
    await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    expect(screen.queryByText(/Tu sesión terminó/)).toBeNull();
    expect(auth.refreshCalls).toEqual([]);
  });

  it("con un token de refresco que ya no sirve avisa que la sesión terminó y conserva el origen", async () => {
    localStorage.setItem("libroya.refresh", "ya-no-sirve");
    const { router } = await renderApp("/carrito");
    expect(
      await screen.findByText("Tu sesión terminó. Entra de nuevo para continuar."),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({ returnTo: "/carrito" });
    expect(localStorage.getItem("libroya.refresh")).toBeNull();
  });

  it("si la red falla al recuperar la sesión, pide entrar pero no pierde el token de refresco", async () => {
    signedIn();
    const saved = localStorage.getItem("libroya.refresh");
    server.use(http.post(API("/auth/refresh"), () => HttpResponse.error()));
    const { router } = await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    expect(router.state.location.pathname).toBe("/ingresar");
    expect(localStorage.getItem("libroya.refresh")).toBe(saved);
    expect(screen.queryByText(/Tu sesión terminó/)).toBeNull();
  });
});

describe("ruta con sesión, con sesión", () => {
  it("espera a recuperar la sesión y muestra la pantalla, sin pasar por /ingresar", async () => {
    signedIn();
    const { router } = await renderApp("/carrito");
    expect(await screen.findByRole("heading", { name: "Tu carrito" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/carrito");
    expect(auth.refreshCalls).toHaveLength(1);
  });

  it("recuperar la sesión una vez sirve para las rutas siguientes", async () => {
    signedIn();
    const { router } = await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Tu carrito" });
    await router.navigate({ to: "/" });
    await router.navigate({ to: "/carrito" });
    expect(await screen.findByRole("heading", { name: "Tu carrito" })).toBeTruthy();
    expect(auth.refreshCalls).toHaveLength(1);
  });
});

describe("pantallas de entrada, con sesión", () => {
  it.each(["/ingresar", "/registro"])("%s redirige al catálogo", async (path) => {
    signedIn();
    const { router } = await renderApp(path);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Libros" })).toBeTruthy();
  });

  it("si trae un returnTo interno, redirige ahí", async () => {
    signedIn();
    const { router } = await renderApp("/ingresar?returnTo=%2Flibros%2F9780132350884");
    await waitFor(() => expect(router.state.location.pathname).toBe("/libros/9780132350884"));
  });

  it.each(["https%3A%2F%2Fotro.com", "%2F%2Fotro.com", "javascript%3Aalert(1)"])(
    "un returnTo ajeno (%s) se ignora y va al catálogo",
    async (value) => {
      signedIn();
      const { router } = await renderApp(`/registro?returnTo=${value}`);
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    },
  );

  it("sin sesión se ven con normalidad", async () => {
    await renderApp("/registro");
    expect(await screen.findByRole("heading", { name: "Crea tu cuenta" })).toBeTruthy();
  });
});

describe("rutas públicas", () => {
  it.each(["/", "/libros/9780132350884"])("%s no pide sesión", async (path) => {
    const { router } = await renderApp(path);
    await waitFor(() => expect(router.state.location.pathname).toBe(path));
    expect(screen.queryByRole("heading", { name: "Entra a tu cuenta" })).toBeNull();
  });
});
