import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vite-plus/test";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const twenty = (from = 1) => Array.from({ length: 20 }, (_, n) => bookNumber(from + n));

describe("PA-01 Catálogo: la lista", () => {
  it("al abrir sin buscar pide la página 1 de 20 sin q y muestra cada libro con título, autor y precio", async () => {
    let received: URL | undefined;
    server.use(
      searchHandler((url) => {
        received = url;
        return page([book(), bookNumber(2)], { total: 2 });
      }),
    );
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: "Libros", level: 1 })).toBeTruthy();
    const card = (await screen.findByRole("heading", { name: "Clean Code" })).closest("article");
    expect(card).toBeTruthy();
    expect(
      within(card as HTMLElement).getByText("Robert C. Martin", { selector: "p" }),
    ).toBeTruthy();
    expect(within(card as HTMLElement).getByText("S/ 90.00")).toBeTruthy();
    expect(received?.searchParams.get("page")).toBe("1");
    expect(received?.searchParams.get("pageSize")).toBe("20");
    expect(received?.searchParams.has("q")).toBe(false);
  });

  it("el título de cada libro es un enlace a su página", async () => {
    server.use(searchHandler(() => page([book()])));
    await renderApp("/");
    const link = await screen.findByRole("link", { name: "Clean Code" });
    expect(link.getAttribute("href")).toBe("/libros/9780132350884");
  });

  it("un precio en dólares se muestra en dólares", async () => {
    server.use(searchHandler(() => page([book({ price: { amount: "40.00", currency: "USD" } })])));
    await renderApp("/");
    expect(await screen.findByText("40.00 USD")).toBeTruthy();
  });

  it("sin búsqueda no hay línea de resultados ni botón para limpiar", async () => {
    server.use(searchHandler(() => page([book()])));
    await renderApp("/");
    await screen.findByRole("heading", { name: "Clean Code" });
    expect(screen.queryByText(/resultado/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).toBeNull();
  });

  it("no tiene violaciones de accesibilidad", async () => {
    server.use(searchHandler(() => page(twenty(), { total: 45 })));
    const { container } = await renderApp("/");
    await screen.findByRole("heading", { name: "Libro 01" });
    await expectNoA11yViolations(container);
  });
});

describe("PA-01 Catálogo: la búsqueda vive en la URL", () => {
  it("con q en la URL la pide a la API y dice cuántos resultados hay en total", async () => {
    let received: URL | undefined;
    server.use(
      searchHandler((url) => {
        received = url;
        return page([book()], { total: 24 });
      }),
    );
    await renderApp("/?q=clean&page=1");
    expect(await screen.findByText("24 resultados para «clean»")).toBeTruthy();
    expect(received?.searchParams.get("q")).toBe("clean");
  });

  it("un solo resultado se dice en singular", async () => {
    server.use(searchHandler(() => page([book()], { total: 1 })));
    await renderApp("/?q=clean");
    expect(await screen.findByText("1 resultado para «clean»")).toBeTruthy();
  });

  it("Limpiar búsqueda quita q y vuelve a la página 1", async () => {
    const user = userEvent.setup();
    const received: (string | null)[] = [];
    server.use(
      searchHandler((url) => {
        received.push(url.searchParams.get("q"));
        return page([book()], { total: 1 });
      }),
    );
    const { router } = await renderApp("/?q=clean&page=2");
    await user.click(await screen.findByRole("button", { name: "Limpiar búsqueda" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 1 }));
    await waitFor(() => expect(received.at(-1)).toBeNull());
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).toBeNull();
  });

  it("el título de la pestaña dice qué se buscó", async () => {
    server.use(searchHandler(() => page([book()], { total: 1 })));
    await renderApp("/?q=clean");
    await screen.findByText("1 resultado para «clean»");
    await waitFor(() => expect(document.title).toBe("Resultados para «clean» · LibroYa"));
  });

  it.each([
    ["page=abc", "abc"],
    ["page=0", "0"],
    ["page=-3", "-3"],
    ["page=1.5", "1.5"],
    ["page=", ""],
  ])("una página inválida en la URL (%s) se corrige a la 1", async (query) => {
    let received: URL | undefined;
    server.use(
      searchHandler((url) => {
        received = url;
        return page([book()]);
      }),
    );
    await renderApp(`/?${query}`);
    await screen.findByRole("heading", { name: "Clean Code" });
    expect(received?.searchParams.get("page")).toBe("1");
  });

  it("un q de solo espacios se descarta", async () => {
    let received: URL | undefined;
    server.use(
      searchHandler((url) => {
        received = url;
        return page([book()]);
      }),
    );
    await renderApp("/?q=%20%20");
    await screen.findByRole("heading", { name: "Clean Code" });
    expect(received?.searchParams.has("q")).toBe(false);
    expect(screen.queryByText(/resultado/)).toBeNull();
  });
});

describe("PA-01 Catálogo: sin resultados", () => {
  it("dice qué se buscó, sugiere otra cosa y deja limpiar la búsqueda", async () => {
    const user = userEvent.setup();
    server.use(
      searchHandler((url) =>
        url.searchParams.get("q") ? page([], { total: 0 }) : page([book()], { total: 1 }),
      ),
    );
    await renderApp("/?q=xyzzy");
    expect(
      await screen.findByText(
        "No encontramos libros para «xyzzy». Prueba con otro título o autor.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Limpiar búsqueda" }));
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
  });

  it("un catálogo vacío sin búsqueda lo dice sin culpar a nadie", async () => {
    server.use(searchHandler(() => page([], { total: 0 })));
    await renderApp("/");
    expect(await screen.findByText("Todavía no hay libros en el catálogo.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).toBeNull();
  });

  it("una página más allá del final no se queda en blanco: lleva a la primera", async () => {
    const user = userEvent.setup();
    server.use(
      searchHandler((url) =>
        url.searchParams.get("page") === "9"
          ? page([], { page: 9, total: 45 })
          : page(twenty(), { total: 45 }),
      ),
    );
    const { router } = await renderApp("/?page=9");
    expect(await screen.findByText("Esta página no existe.")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Ir a la primera página" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ page: 1 }));
    expect(await screen.findByRole("heading", { name: "Libro 01" })).toBeTruthy();
  });
});

describe("PA-01 Catálogo: paginación", () => {
  const forPage = () =>
    searchHandler((url) => {
      const n = Number(url.searchParams.get("page") ?? "1");
      return page(twenty((n - 1) * 20 + 1), { page: n, total: 45 });
    });

  it("dice en qué página está y cuántas hay (45 libros son 3 páginas)", async () => {
    server.use(forPage());
    await renderApp("/");
    expect(await screen.findByText("Página 1 de 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("Siguiente pide la página 2, la guarda en la URL y mueve el foco al principio de la lista", async () => {
    const user = userEvent.setup();
    server.use(forPage());
    const { router } = await renderApp("/");
    await user.click(await screen.findByRole("button", { name: "Siguiente" }));
    expect(await screen.findByRole("heading", { name: "Libro 21" })).toBeTruthy();
    expect(router.state.location.search).toEqual({ page: 2 });
    expect(screen.getByText("Página 2 de 3")).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("heading", { name: "Libros", level: 1 }),
      ),
    );
  });

  it("la última página tiene Siguiente deshabilitado", async () => {
    server.use(forPage());
    await renderApp("/?page=3");
    expect(await screen.findByText("Página 3 de 3")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("al paginar con una búsqueda conserva q", async () => {
    const user = userEvent.setup();
    server.use(forPage());
    const { router } = await renderApp("/?q=libro&page=1");
    await user.click(await screen.findByRole("button", { name: "Siguiente" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "libro", page: 2 }));
  });
});

describe("PA-01 Catálogo: cargando y error", () => {
  it("mientras carga muestra esqueletos y avisa a los lectores de pantalla", async () => {
    const gate = deferred();
    server.use(
      http.get(API("/books"), async () => {
        await gate.promise;
        return HttpResponse.json(page([book()]));
      }),
    );
    const { container } = await renderApp("/");
    expect(screen.getByRole("status").textContent).toContain("Cargando libros");
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(6);
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    gate.release();
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("si falla muestra el error con el código de soporte y deja reintentar", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    server.use(
      http.get(API("/books"), () => {
        attempts += 1;
        return attempts === 1
          ? apiError(500, "INTERNAL_ERROR", "7c1e4a90-3b2d")
          : HttpResponse.json(page([book()]));
      }),
    );
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByText("7c1e4a90-3b2d")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
    expect(attempts).toBe(2);
  });

  it("sin conexión muestra el error sin código de soporte", async () => {
    server.use(http.get(API("/books"), () => HttpResponse.error()));
    await renderApp("/");
    expect(await screen.findByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.queryByText(/Código de soporte/)).toBeNull();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
