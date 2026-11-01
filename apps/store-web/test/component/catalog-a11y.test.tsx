import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vite-plus/test";
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

// Una respuesta retenida hasta que se suelta: la prueba mira el estado «cargando» sin depender del reloj
const held = <T,>(body: T) => {
  const gate = deferred();
  const handler = http.all(API("/*"), async () => {
    await gate.promise;
    return HttpResponse.json(body as never);
  });
  return { handler, release: gate.release };
};

const h1s = () => screen.getAllByRole("heading", { level: 1 });

describe("F1.4 · PA-01: accesibilidad de cada estado", () => {
  const twenty = Array.from({ length: 20 }, (_, n) => bookNumber(n + 1));

  it("con la lista", async () => {
    // Con seis libros y el total de 45 se ve la paginación; axe con las veinte tarjetas tarda más que el límite de la prueba
    server.use(searchHandler(() => page(twenty.slice(0, 6), { total: 45 })));
    const { container } = await renderApp("/");
    await screen.findByRole("heading", { name: "Libro 01" });
    expect(h1s()).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it("con una búsqueda", async () => {
    server.use(searchHandler(() => page([book()], { total: 1 })));
    const { container } = await renderApp("/?q=clean");
    await screen.findByText("1 resultado para «clean»");
    await expectNoA11yViolations(container);
  });

  it("cargando", async () => {
    const response = held(page([book()]));
    server.use(response.handler);
    const { container } = await renderApp("/");
    expect(screen.getByRole("status")).toBeTruthy();
    await expectNoA11yViolations(container);
    response.release();
  });

  it("sin resultados", async () => {
    server.use(searchHandler(() => page([], { total: 0 })));
    const { container } = await renderApp("/?q=xyzzy");
    await screen.findByText(/No encontramos libros para «xyzzy»/);
    expect(h1s()).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it("catálogo vacío", async () => {
    server.use(searchHandler(() => page([], { total: 0 })));
    const { container } = await renderApp("/");
    await screen.findByText("Todavía no hay libros en el catálogo.");
    await expectNoA11yViolations(container);
  });

  it("página fuera de rango", async () => {
    server.use(
      searchHandler((url) =>
        url.searchParams.get("page") === "9"
          ? page([], { page: 9, total: 45 })
          : page(twenty, { total: 45 }),
      ),
    );
    const { container } = await renderApp("/?page=9");
    await screen.findByText("Esta página no existe.");
    await expectNoA11yViolations(container);
  });

  it("con error", async () => {
    server.use(searchHandler(() => apiError(500, "INTERNAL_ERROR", "abc-123")));
    const { container } = await renderApp("/");
    await screen.findByRole("heading", { name: "Algo salió mal" });
    expect(h1s()).toHaveLength(1);
    await expectNoA11yViolations(container);
  });
});

describe("F1.4 · PA-02: accesibilidad de cada estado", () => {
  it("cargando", async () => {
    const response = held(book());
    server.use(response.handler);
    const { container } = await renderApp("/libros/9780132350884");
    expect(screen.getByRole("status")).toBeTruthy();
    await expectNoA11yViolations(container);
    response.release();
  });

  it("con error", async () => {
    server.use(detailHandler(() => apiError(500, "INTERNAL_ERROR", "abc-123")));
    const { container } = await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Algo salió mal" });
    expect(h1s()).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it("el libro tiene un solo encabezado de primer nivel", async () => {
    server.use(detailHandler(() => book()));
    await renderApp("/libros/9780132350884");
    await screen.findByRole("heading", { name: "Clean Code" });
    expect(h1s()).toHaveLength(1);
  });
});

describe("F1.4 · teclado", () => {
  it("se llega a un libro y se abre solo con el teclado", async () => {
    const user = userEvent.setup();
    server.use(
      searchHandler(() => page([book()], { total: 1 })),
      detailHandler(() => book()),
    );
    const { router } = await renderApp("/");
    const link = await screen.findByRole("link", { name: "Clean Code" });
    for (let presses = 0; presses < 30 && document.activeElement !== link; presses += 1)
      await user.tab();
    expect(document.activeElement).toBe(link);
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Clean Code", level: 1 })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/libros/9780132350884");
  });

  it("la paginación se alcanza y se activa con el teclado, y los deshabilitados se saltan", async () => {
    const user = userEvent.setup();
    server.use(
      searchHandler((url) => {
        const n = Number(url.searchParams.get("page") ?? "1");
        return page([bookNumber(n)], { page: n, total: 45 });
      }),
    );
    const { router } = await renderApp("/");
    const next = await screen.findByRole("button", { name: "Siguiente" });
    for (let presses = 0; presses < 30 && document.activeElement !== next; presses += 1)
      await user.tab();
    // Anterior está deshabilitado: no recibió el foco por el camino
    expect(document.activeElement).toBe(next);
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Página 2 de 3")).toBeTruthy();
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it("ningún elemento enfocable de las pantallas esconde su foco", async () => {
    server.use(searchHandler(() => page([book(), bookNumber(2)], { total: 45 })));
    const { container } = await renderApp("/?q=libro");
    await screen.findByRole("heading", { name: "Clean Code" });
    const focusable = container.querySelectorAll<HTMLElement>("a[href], button, input, [tabindex]");
    expect(focusable.length).toBeGreaterThan(0);
    for (const element of focusable) {
      // El título de la pantalla recibe el foco por código (tabindex -1) y lo dibuja el ancla de :focus-visible
      if (element.getAttribute("tabindex") === "-1") continue;
      if (!/(^|\s)outline-none(\s|$)/.test(element.className)) continue;
      // Sin contorno propio, un contenedor tiene que dibujarlo (el campo de búsqueda lo hace con `focus-within`)
      const drawn = element.closest('[class*="focus-within:outline"]');
      expect(drawn, element.outerHTML.slice(0, 80)).toBeTruthy();
    }
  });
});
