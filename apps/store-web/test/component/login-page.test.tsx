import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { getSessionState } from "@/features/auth/index.ts";
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

const fill = async (email: string, password: string) => {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("Correo electrónico"), email);
  if (password) await user.type(screen.getByLabelText("Contraseña"), password);
  return user;
};

describe("PA-04 Iniciar sesión: la pantalla", () => {
  it("tiene el título, los dos campos con su etiqueta, el botón y el enlace para crear cuenta", async () => {
    await renderApp("/ingresar");
    expect(
      await screen.findByRole("heading", { name: "Entra a tu cuenta", level: 1 }),
    ).toBeTruthy();
    expect(screen.getByLabelText("Correo electrónico")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Crea una" }).getAttribute("href")).toBe("/registro");
  });

  it("los campos piden lo que el navegador sabe autocompletar", async () => {
    await renderApp("/ingresar");
    const email = await screen.findByLabelText("Correo electrónico");
    const password = screen.getByLabelText("Contraseña");
    expect(email.getAttribute("type")).toBe("email");
    expect(email.getAttribute("autocomplete")).toBe("email");
    expect(password.getAttribute("type")).toBe("password");
    expect(password.getAttribute("autocomplete")).toBe("current-password");
  });

  it("el título de la pestaña dice dónde se está", async () => {
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    await waitFor(() => expect(document.title).toBe("Entrar · LibroYa"));
  });

  it("mostrar y ocultar la contraseña", async () => {
    const user = userEvent.setup();
    await renderApp("/ingresar");
    const password = await screen.findByLabelText("Contraseña");
    const toggle = screen.getByRole("button", { name: "Mostrar contraseña" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    await user.click(toggle);
    expect(password.getAttribute("type")).toBe("text");
    expect(
      screen.getByRole("button", { name: "Ocultar contraseña" }).getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
    expect(password.getAttribute("type")).toBe("password");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    const { container } = await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    await expectNoA11yViolations(container);
  });
});

describe("PA-04 Iniciar sesión: entrar", () => {
  it("con credenciales correctas inicia la sesión y lleva al catálogo", async () => {
    const { router } = await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(getSessionState()).toMatchObject({
      status: "authenticated",
      user: { email: "ana@example.com" },
    });
    expect(localStorage.getItem("libroya.refresh")).toMatch(/^refresh-/);
    expect(await screen.findByRole("heading", { name: "Libro 01" })).toBeTruthy();
  });

  it("manda el correo y la contraseña tal como se escribieron: la API recorta y normaliza el correo, y no recorta la contraseña", async () => {
    let body: unknown;
    server.use(
      http.post(API("/auth/login"), async ({ request }) => {
        body = await request.json();
        return apiError(401, "INVALID_CREDENTIALS");
      }),
    );
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("Ana@Example.com", " con espacios ");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByRole("alert");
    expect(body).toEqual({ email: "Ana@Example.com", password: " con espacios " });
  });

  it("vuelve a la ruta de origen (returnTo) cuando es interna", async () => {
    const { router } = await renderApp("/ingresar?returnTo=%2Flibros%2F9780132350884");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/libros/9780132350884"));
  });

  it.each(["https://otro.com", "//otro.com", "%2F%2Fotro.com"])(
    "ignora un returnTo ajeno (%s) y va al catálogo",
    async (value) => {
      const { router } = await renderApp(
        `/ingresar?returnTo=${value.startsWith("%") ? value : encodeURIComponent(value)}`,
      );
      await screen.findByRole("heading", { name: "Entra a tu cuenta" });
      const user = await fill("ana@example.com", "LibroYa-dev-2026");
      await user.click(screen.getByRole("button", { name: "Entrar" }));
      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    },
  );

  it("mientras la petición está en curso el botón se deshabilita y no se envía dos veces", async () => {
    let calls = 0;
    server.use(
      http.post(API("/auth/login"), async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 80));
        return apiError(401, "INVALID_CREDENTIALS");
      }),
    );
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "LibroYa-dev-2026");
    const button = screen.getByRole("button", { name: "Entrar" });
    await user.click(button);
    const busy = await screen.findByRole("button", { name: "Entrando…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await user.click(busy);
    await screen.findByRole("alert");
    expect(calls).toBe(1);
    expect((screen.getByRole("button", { name: "Entrar" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("PA-04 Iniciar sesión: errores", () => {
  it("credenciales incorrectas dan un solo mensaje, sin decir cuál falla, y conservan el correo", async () => {
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "otra contraseña");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Correo o contraseña incorrectos.");
    expect((screen.getByLabelText("Correo electrónico") as HTMLInputElement).value).toBe(
      "ana@example.com",
    );
    expect(getSessionState().status).not.toBe("authenticated");
    expect(localStorage.getItem("libroya.refresh")).toBeNull();
  });

  it("un correo desconocido da exactamente el mismo mensaje", async () => {
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("nadie@example.com", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Correo o contraseña incorrectos.",
    );
  });

  it("tras un error, la contraseña se borra y el foco vuelve a ella", async () => {
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "otra contraseña");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByRole("alert");
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;
    expect(password.value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(password));
  });

  it("un 429 pide esperar", async () => {
    server.use(http.post(API("/auth/login"), () => apiError(429, "TOO_MANY_REQUESTS")));
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Hiciste demasiados intentos");
  });

  it("sin conexión lo dice", async () => {
    server.use(http.post(API("/auth/login"), () => HttpResponse.error()));
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect((await screen.findByRole("alert")).textContent).toContain("no tienes conexión");
  });

  it("un 500 da un mensaje genérico, sin hablar de cobros", async () => {
    server.use(http.post(API("/auth/login"), () => apiError(500, "INTERNAL_ERROR")));
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    const text = (await screen.findByRole("alert")).textContent ?? "";
    expect(text).toContain("Algo salió mal");
    expect(text).not.toMatch(/cobr/i);
  });

  it("el error es accesible: se anuncia y el formulario no tiene violaciones", async () => {
    const { container } = await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("ana@example.com", "otra contraseña");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByRole("alert");
    await expectNoA11yViolations(container);
  });
});

describe("PA-04 Iniciar sesión: validación antes de enviar", () => {
  it("campos vacíos: dice qué falta junto a cada campo y no llama a la API", async () => {
    const user = userEvent.setup();
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Escribe tu correo.")).toBeTruthy();
    expect(screen.getByText("Escribe tu contraseña.")).toBeTruthy();
    expect(auth.loginCalls).toBe(0);
    const email = screen.getByLabelText("Correo electrónico");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-describedby")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(email));
  });

  it("un correo mal escrito se avisa con el mensaje de producto", async () => {
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = await fill("sin-arroba", "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    expect(await screen.findByText("Escribe un correo válido.")).toBeTruthy();
    expect(auth.loginCalls).toBe(0);
  });

  it("el error de un campo desaparece al corregirlo", async () => {
    await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByText("Escribe tu correo.");
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await waitFor(() => expect(screen.queryByText("Escribe tu correo.")).toBeNull());
  });

  it("con errores de campo sigue sin violaciones de accesibilidad", async () => {
    const { container } = await renderApp("/ingresar");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    await userEvent.setup().click(screen.getByRole("button", { name: "Entrar" }));
    await screen.findByText("Escribe tu correo.");
    await expectNoA11yViolations(container);
  });
});

describe("PA-04 Iniciar sesión: avisos", () => {
  it("si llegó pidiendo sesión para armar el carrito", async () => {
    await renderApp("/ingresar?aviso=carrito");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Entra para armar tu carrito.",
    );
  });

  it("tras crear la cuenta, deja el correo escrito y avisa", async () => {
    await renderApp("/ingresar?aviso=creada&correo=ana%40example.com");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Cuenta creada. Entra para continuar.",
    );
    expect((screen.getByLabelText("Correo electrónico") as HTMLInputElement).value).toBe(
      "ana@example.com",
    );
  });

  it("si la sesión terminó sola avisa una sola vez", async () => {
    // Un token de refresco que ya no sirve: el arranque lo descubre y deja el aviso
    localStorage.setItem("libroya.refresh", "ya-no-sirve");
    const { router } = await renderApp("/ingresar");
    expect((await screen.findByRole("status")).textContent).toContain(
      "Tu sesión terminó. Entra de nuevo para continuar.",
    );
    await router.navigate({ to: "/" });
    await router.navigate({ to: "/ingresar", search: {} });
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    expect(screen.queryByText(/Tu sesión terminó/)).toBeNull();
  });

  it("un aviso desconocido en la URL se ignora", async () => {
    await renderApp("/ingresar?aviso=cualquier-cosa&correo=no-es-correo");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    expect(screen.queryByRole("status")).toBeNull();
    expect((screen.getByLabelText("Correo electrónico") as HTMLInputElement).value).toBe("");
  });
});
