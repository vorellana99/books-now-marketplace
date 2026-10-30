import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vite-plus/test";
import { API, apiError, book, detailHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

describe("PA-02 Detalle del libro", () => {
  it("muestra título, autor, ISBN y precio con su moneda, y el botón para agregar", async () => {
    server.use(detailHandler(() => book()));
    await renderApp("/libros/9780132350884");
    expect(await screen.findByRole("heading", { name: "Clean Code", level: 1 })).toBeTruthy();
    expect(screen.getByText("Robert C. Martin", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("9780132350884")).toBeTruthy();
    expect(screen.getByText("S/ 90.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Agregar al carrito" })).toBeTruthy();
  });

  it("un precio en dólares se muestra en dólares", async () => {
    server.use(detailHandler(() => book({ price: { amount: "40.00", currency: "USD" } })));
    await renderApp("/libros/9780132350884");
    expect(await screen.findByText("40.00 USD")).toBeTruthy();
  });

  it("no muestra el stock: la API no lo expone y se descubre al pagar", async () => {
    server.use(detailHandler(() => book()));
    await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Clean Code" });
    expect(screen.queryByText(/stock|unidades|disponibles/i)).toBeNull();
  });

  it("pide a la API el ISBN de la URL, también con guiones", async () => {
    let received = "";
    server.use(
      detailHandler((isbn) => {
        received = isbn;
        return book();
      }),
    );
    await renderApp("/libros/978-0-13-235088-4");
    await screen.findByRole("heading", { name: "Clean Code" });
    expect(received).toBe("978-0-13-235088-4");
  });

  it("el título de la pestaña lleva el del libro", async () => {
    server.use(detailHandler(() => book()));
    await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Clean Code" });
    await waitFor(() => expect(document.title).toBe("Clean Code · LibroYa"));
  });

  it("tiene un enlace para volver a los libros", async () => {
    server.use(detailHandler(() => book()));
    await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Clean Code" });
    const back = screen.getByRole("link", { name: "Volver a los libros" });
    expect(back.getAttribute("href")).toBe("/");
  });

  it("no tiene violaciones de accesibilidad", async () => {
    server.use(detailHandler(() => book()));
    const { container } = await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Clean Code" });
    await expectNoA11yViolations(container);
  });
});

describe("PA-02 Detalle: libro no disponible", () => {
  it.each([
    [404, "NOT_FOUND"],
    [422, "INVALID_ISBN"],
  ])("un %i (%s) da el mismo «no disponible», con un enlace a los libros", async (status, code) => {
    server.use(detailHandler(() => apiError(status, code)));
    const { container } = await renderApp("/libros/9780132350884");
    expect(
      await screen.findByRole("heading", { name: "Este libro no está disponible." }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver los libros" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("button", { name: "Agregar al carrito" })).toBeNull();
    await expectNoA11yViolations(container);
  });

  it("un ISBN mal formado en la URL no rompe la pantalla", async () => {
    server.use(detailHandler(() => apiError(422, "INVALID_ISBN")));
    await renderApp("/libros/esto-no-es-un-isbn");
    expect(
      await screen.findByRole("heading", { name: "Este libro no está disponible." }),
    ).toBeTruthy();
  });

  it("el título de la pestaña lo dice", async () => {
    server.use(detailHandler(() => apiError(404, "NOT_FOUND")));
    await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Este libro no está disponible." });
    await waitFor(() => expect(document.title).toBe("Libro no disponible · LibroYa"));
  });
});

describe("PA-02 Detalle: cargando y error", () => {
  it("mientras carga muestra un esqueleto y avisa a los lectores de pantalla", async () => {
    const gate = deferred();
    server.use(
      http.get(API("/books/:isbn"), async () => {
        await gate.promise;
        return HttpResponse.json(book());
      }),
    );
    const { container } = await renderApp("/libros/9780132350884");
    expect(screen.getByRole("status").textContent).toContain("Cargando el libro");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
    gate.release();
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si falla muestra el error con el código de soporte y deja reintentar", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    server.use(
      http.get(API("/books/:isbn"), () => {
        attempts += 1;
        return attempts === 1
          ? apiError(500, "INTERNAL_ERROR", "7c1e4a90-3b2d")
          : HttpResponse.json(book());
      }),
    );
    await renderApp("/libros/9780132350884");
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByText("7c1e4a90-3b2d")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
  });

  it("sin conexión muestra el error sin código de soporte", async () => {
    server.use(http.get(API("/books/:isbn"), () => HttpResponse.error()));
    await renderApp("/libros/9780132350884");
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.queryByText(/Código de soporte/)).toBeNull();
  });
});
