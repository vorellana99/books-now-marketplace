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
import { deferred } from "../support/deferred.ts";
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

const open = async (path = "/registro") => {
  const app = await renderApp(path);
  await screen.findByRole("heading", { name: "Crea tu cuenta", level: 1 });
  return app;
};

const fill = async (email: string, password: string) => {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText("Correo electrónico"), email);
  if (password) await user.type(screen.getByLabelText("Contraseña"), password);
  return user;
};

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Crear cuenta" }));

describe("PA-03 Registrarse: la pantalla", () => {
  it("tiene título, campos con etiqueta, la ayuda de la contraseña, el botón y el enlace para entrar", async () => {
    await open();
    expect(screen.getByLabelText("Correo electrónico").getAttribute("autocomplete")).toBe("email");
    const password = screen.getByLabelText("Contraseña");
    expect(password.getAttribute("autocomplete")).toBe("new-password");
    expect(password.getAttribute("type")).toBe("password");
    expect(screen.getByText("Al menos 10 caracteres.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear cuenta" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Entra" }).getAttribute("href")).toBe("/ingresar");
  });

  it("el título de la pestaña dice dónde se está", async () => {
    await open();
    await waitFor(() => expect(document.title).toBe("Crear cuenta · LibroYa"));
  });

  it("el enlace para entrar conserva a dónde volver", async () => {
    await open("/registro?returnTo=%2Flibros%2F9780132350884");
    expect(screen.getByRole("link", { name: "Entra" }).getAttribute("href")).toContain(
      "returnTo=%2Flibros%2F9780132350884",
    );
  });

  it("mostrar y ocultar la contraseña", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
    expect(screen.getByLabelText("Contraseña").getAttribute("type")).toBe("text");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    const { container } = await open();
    await expectNoA11yViolations(container);
  });
});

describe("PA-03 Registrarse: crear la cuenta", () => {
  it("crea la cuenta, inicia la sesión sola con las mismas credenciales y lleva al catálogo", async () => {
    const { router } = await open();
    const user = await fill("nuevo@example.com", "una contraseña larga");
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(auth.users.has("nuevo@example.com")).toBe(true);
    expect(auth.loginCalls).toBe(1);
    expect(getSessionState()).toMatchObject({
      status: "authenticated",
      user: { email: "nuevo@example.com" },
    });
    expect(localStorage.getItem("libroya.refresh")).toMatch(/^refresh-/);
  });

  it("vuelve a donde estaba (returnTo) cuando es una ruta interna", async () => {
    const { router } = await open("/registro?returnTo=%2Flibros%2F9780132350884");
    const user = await fill("nuevo@example.com", "una contraseña larga");
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe("/libros/9780132350884"));
  });

  it("manda el correo y la contraseña tal como se escribieron (la contraseña no se recorta)", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(API("/auth/register"), async ({ request }) => {
        bodies.push(await request.json());
        return apiError(409, "EMAIL_ALREADY_REGISTERED");
      }),
    );
    await open();
    const user = await fill("Nuevo@Example.com", "  con espacios  ");
    await submit(user);
    await screen.findByText(/Ya existe una cuenta/);
    expect(bodies).toEqual([{ email: "Nuevo@Example.com", password: "  con espacios  " }]);
  });

  it("si la cuenta se creó pero el inicio de sesión falla, va a PA-04 con el correo escrito y el aviso", async () => {
    server.use(http.post(API("/auth/login"), () => apiError(500, "INTERNAL_ERROR")));
    const { router } = await open("/registro?returnTo=%2Fcarrito");
    const user = await fill("nuevo@example.com", "una contraseña larga");
    await submit(user);
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({
      aviso: "creada",
      correo: "nuevo@example.com",
      returnTo: "/carrito",
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Cuenta creada. Entra para continuar.",
    );
    expect((screen.getByLabelText("Correo electrónico") as HTMLInputElement).value).toBe(
      "nuevo@example.com",
    );
    expect(auth.users.has("nuevo@example.com")).toBe(true);
  });

  it("mientras la petición está en curso el botón se deshabilita y no se registra dos veces", async () => {
    let registers = 0;
    const gate = deferred();
    server.use(
      http.post(API("/auth/register"), async () => {
        registers += 1;
        await gate.promise;
        return apiError(409, "EMAIL_ALREADY_REGISTERED");
      }),
    );
    await open();
    const user = await fill("nuevo@example.com", "una contraseña larga");
    await submit(user);
    const busy = await screen.findByRole("button", { name: "Creando tu cuenta…" });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    await user.click(busy);
    gate.release();
    await screen.findByText(/Ya existe una cuenta/);
    expect(registers).toBe(1);
  });
});

describe("PA-03 Registrarse: errores del servidor, junto al campo", () => {
  it("EMAIL_ALREADY_REGISTERED ofrece entrar y no pierde lo escrito", async () => {
    await open();
    const user = await fill("ana@example.com", "una contraseña larga");
    await submit(user);
    expect(await screen.findByText(/Ya existe una cuenta con ese correo\./)).toBeTruthy();
    const link = screen.getByRole("link", { name: "¿Quieres entrar?" });
    expect(link.getAttribute("href")).toContain("/ingresar");
    expect(link.getAttribute("href")).toContain("correo=ana%40example.com");
    const email = screen.getByLabelText("Correo electrónico") as HTMLInputElement;
    expect(email.value).toBe("ana@example.com");
    expect((screen.getByLabelText("Contraseña") as HTMLInputElement).value).toBe(
      "una contraseña larga",
    );
    expect(email.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(email));
  });

  it("WEAK_PASSWORD sale debajo de la contraseña y el foco va a ella", async () => {
    server.use(http.post(API("/auth/register"), () => apiError(422, "WEAK_PASSWORD")));
    await open();
    const user = await fill("nuevo@example.com", "password1234");
    await submit(user);
    expect(await screen.findByText(/Elige una contraseña más segura/)).toBeTruthy();
    const password = screen.getByLabelText("Contraseña") as HTMLInputElement;
    expect(password.getAttribute("aria-invalid")).toBe("true");
    expect(password.value).toBe("password1234");
    await waitFor(() => expect(document.activeElement).toBe(password));
  });

  it("INVALID_EMAIL sale debajo del correo", async () => {
    server.use(http.post(API("/auth/register"), () => apiError(422, "INVALID_EMAIL")));
    await open();
    const user = await fill("a@b.co", "una contraseña larga");
    await submit(user);
    expect(await screen.findByText("Escribe un correo válido.")).toBeTruthy();
    expect(screen.getByLabelText("Correo electrónico").getAttribute("aria-invalid")).toBe("true");
  });

  it("el error de un campo desaparece cuando se corrige", async () => {
    await open();
    const user = await fill("ana@example.com", "una contraseña larga");
    await submit(user);
    await screen.findByText(/Ya existe una cuenta/);
    await user.type(screen.getByLabelText("Correo electrónico"), "x");
    await waitFor(() => expect(screen.queryByText(/Ya existe una cuenta/)).toBeNull());
  });

  it.each([
    [429, "TOO_MANY_REQUESTS", "Hiciste demasiados intentos"],
    [500, "INTERNAL_ERROR", "Algo salió mal"],
  ])("un %i da un aviso general sobre el formulario", async (status, code, text) => {
    server.use(http.post(API("/auth/register"), () => apiError(status, code)));
    await open();
    const user = await fill("nuevo@example.com", "una contraseña larga");
    await submit(user);
    expect((await screen.findByRole("alert")).textContent).toContain(text);
  });

  it("sin conexión lo dice", async () => {
    server.use(http.post(API("/auth/register"), () => HttpResponse.error()));
    await open();
    const user = await fill("nuevo@example.com", "una contraseña larga");
    await submit(user);
    expect((await screen.findByRole("alert")).textContent).toContain("no tienes conexión");
  });

  it("con errores sigue sin violaciones de accesibilidad", async () => {
    const { container } = await open();
    const user = await fill("ana@example.com", "una contraseña larga");
    await submit(user);
    await screen.findByText(/Ya existe una cuenta/);
    await expectNoA11yViolations(container);
  });
});

describe("PA-03 Registrarse: validación antes de enviar", () => {
  it("campos vacíos: dice qué falta junto a cada campo y no llama a la API", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("button", { name: "Crear cuenta" }));
    expect(await screen.findByText("Escribe tu correo.")).toBeTruthy();
    expect(screen.getByText("Elige una contraseña de al menos 10 caracteres.")).toBeTruthy();
    expect(auth.users.size).toBe(1);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Correo electrónico")),
    );
  });

  it("una contraseña de menos de 10 caracteres se avisa antes de enviar, al salir del campo", async () => {
    const user = userEvent.setup();
    await open();
    await user.type(screen.getByLabelText("Contraseña"), "corta");
    await user.tab();
    expect(
      await screen.findByText("La contraseña debe tener al menos 10 caracteres."),
    ).toBeTruthy();
    expect(auth.users.size).toBe(1);
  });

  it("una contraseña de más de 128 caracteres se avisa", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByLabelText("Contraseña"));
    await user.paste("x".repeat(129));
    await user.tab();
    expect(await screen.findByText("La contraseña puede tener hasta 128 caracteres.")).toBeTruthy();
  });

  it("un correo mal escrito se avisa con el mensaje de producto", async () => {
    await open();
    const user = await fill("sin-arroba", "una contraseña larga");
    await submit(user);
    expect(await screen.findByText("Escribe un correo válido.")).toBeTruthy();
    expect(auth.users.size).toBe(1);
  });

  it("la decisión final es del servidor: una contraseña de 10 caracteres sí se envía", async () => {
    await open();
    const user = await fill("nuevo@example.com", "1234567890");
    await submit(user);
    await waitFor(() => expect(auth.users.has("nuevo@example.com")).toBe(true));
  });
});
