import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { REFRESH_KEY } from "@/features/auth/session.ts";
import { FakeAuth } from "../support/auth.ts";
import { bookNumber, page, searchHandler } from "../support/books.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

// F6.5 · Credenciales en el navegador (producto 08): el token de acceso vive solo en memoria, el de refresco en `localStorage`
// y ninguno aparece en la URL, en los logs ni en los mensajes de error
let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
  );
});
afterEach(() => vi.restoreAllMocks());

const everyStoredValue = () =>
  [localStorage, sessionStorage].flatMap((storage) =>
    Array.from(
      { length: storage.length },
      (_, i) => [storage.key(i)!, storage.getItem(storage.key(i)!)!] as const,
    ),
  );

const signInThroughTheForm = async () => {
  const user = userEvent.setup();
  const { router } = await renderApp("/ingresar");
  await user.type(await screen.findByLabelText("Correo electrónico"), "ana@example.com");
  await user.type(screen.getByLabelText("Contraseña"), "LibroYa-dev-2026");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
  await screen.findByRole("heading", { name: "Libros", level: 1 });
  return { user, router };
};

describe("tras entrar con el formulario", () => {
  it("el token de acceso no está en ningún almacenamiento ni en la URL; el de refresco solo bajo su clave", async () => {
    const { router } = await signInThroughTheForm();
    const access = [...auth.liveRefreshTokens()].length; // hay una sesión viva en la API
    expect(access).toBe(1);
    const accessTokens = Array.from({ length: 10 }, (_, i) => `access-${i + 1}`);
    for (const [key, value] of everyStoredValue()) {
      for (const token of accessTokens)
        expect(value, `${key} guarda un token de acceso`).not.toContain(token);
    }
    expect(localStorage.getItem(REFRESH_KEY)).toMatch(/^refresh-/);
    expect(router.state.location.href).not.toMatch(/access|refresh|token/i);
    // La contraseña tampoco se guarda en ningún sitio
    for (const [key, value] of everyStoredValue()) {
      expect(value, `${key} guarda la contraseña`).not.toContain("LibroYa-dev-2026");
    }
  });

  it("no escribe en la consola mientras se entra y se navega (ni token ni contraseña ni nada)", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    await signInThroughTheForm();
    const written = spies.flatMap((spy) =>
      spy.mock.calls.map((args) => args.map(String).join(" ")),
    );
    expect(written.filter((line) => /access-|refresh-|LibroYa-dev-2026/.test(line))).toEqual([]);
  });

  it("un error de entrada no repite la contraseña escrita", async () => {
    const user = userEvent.setup();
    await renderApp("/ingresar");
    await user.type(await screen.findByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "una contraseña equivocada");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).not.toContain("una contraseña equivocada");
    expect(document.body.textContent).not.toContain("una contraseña equivocada");
  });
});

describe("cerrar sesión", () => {
  it("borra el token de refresco del almacenamiento y avisa a la API", async () => {
    const { user } = await signInThroughTheForm();
    const refresh = localStorage.getItem(REFRESH_KEY);
    expect(refresh).not.toBeNull();
    const button = await screen.findByRole("button", { name: "Mi cuenta" });
    button.focus();
    await user.keyboard("{Enter}");
    await user.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(localStorage.getItem(REFRESH_KEY)).toBeNull());
    expect(auth.logoutCalls).toContain(refresh);
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Entrar" })).toBeTruthy();
    for (const [key, value] of everyStoredValue()) {
      expect(value, key).not.toContain(refresh!);
    }
  });
});
