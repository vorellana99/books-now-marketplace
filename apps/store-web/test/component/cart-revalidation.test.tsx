import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

const CLEAN: CartBook = {
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  unitPrice: { amount: "90.00", currency: "PEN" },
};
const DDD: CartBook = {
  isbn: "9780321125217",
  title: "Domain-Driven Design",
  author: "Eric Evans",
  unitPrice: { amount: "120.00", currency: "PEN" },
};

let auth: FakeAuth;
let userId: string;
let requests: string[];

// El catálogo simulado: cada ISBN responde lo que diga `catalog`; si no está, `404`
let catalog: Record<string, ReturnType<typeof book> | Response>;
beforeEach(() => {
  auth = new FakeAuth();
  requests = [];
  catalog = {
    [CLEAN.isbn]: book(),
    [DDD.isbn]: book({ ...DDD, price: DDD.unitPrice }),
  };
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
    http.get(API("/books/:isbn"), ({ params }) => {
      const isbn = String(params.isbn);
      requests.push(isbn);
      const found = catalog[isbn];
      if (found instanceof Response) return found;
      return found ? HttpResponse.json(found) : apiError(404, "NOT_FOUND");
    }),
  );
  userId = auth.signIn().user.id;
});

const fill = (...books: CartBook[]) => {
  for (const item of books) cartStore.getState().add(userId, item);
};
const rowOf = async (title: string) =>
  (await screen.findByRole("heading", { name: title })).closest("li") as HTMLElement;

describe("al abrir el carrito se vuelven a consultar los libros", () => {
  it("pide cada libro una vez", async () => {
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    await waitFor(() => expect(requests.sort()).toEqual([CLEAN.isbn, DDD.isbn].sort()));
  });

  it("cada vez que se abre, aunque la consulta anterior sea reciente", async () => {
    fill(CLEAN);
    const { router } = await renderApp("/carrito");
    await rowOf("Clean Code");
    await waitFor(() => expect(requests).toHaveLength(1));
    await router.navigate({ to: "/" });
    await router.navigate({ to: "/carrito" });
    await rowOf("Clean Code");
    await waitFor(() => expect(requests).toHaveLength(2));
  });

  it("sin cambios no avisa nada", async () => {
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(screen.queryByText(/cambió/)).toBeNull();
    expect(screen.queryByText(/no disponible/i)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("mientras comprueba lo dice, y al terminar lo quita", async () => {
    fill(CLEAN);
    const gate = deferred();
    server.use(
      http.get(API("/books/:isbn"), async () => {
        await gate.promise;
        return HttpResponse.json(book());
      }),
    );
    await renderApp("/carrito");
    await rowOf("Clean Code");
    expect(screen.getByText("Comprobando precios…")).toBeTruthy();
    gate.release();
    await waitFor(() => expect(screen.queryByText("Comprobando precios…")).toBeNull());
  });
});

describe("un precio cambió", () => {
  beforeEach(() => {
    catalog[CLEAN.isbn] = book({ price: { amount: "99.00", currency: "PEN" } });
  });

  it("se actualiza al precio vigente y se avisa en la línea", async () => {
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    const row = await rowOf("Clean Code");
    await waitFor(() => expect(within(row).getByText("S/ 99.00")).toBeTruthy());
    expect(
      within(row).getByText(
        "El precio de este libro cambió. Ahora cuesta S/ 99.00 (antes S/ 90.00).",
      ),
    ).toBeTruthy();
    // el otro libro no cambió
    expect(within(await rowOf("Domain-Driven Design")).queryByText(/cambió/)).toBeNull();
  });

  it("el carrito guardado queda con el precio nuevo", async () => {
    fill(CLEAN);
    await renderApp("/carrito");
    await waitFor(() =>
      expect(cartStore.getState().linesOf(userId)[0]?.unitPrice).toEqual({
        amount: "99.00",
        currency: "PEN",
      }),
    );
  });

  it("avisa también arriba, de lo que cambió", async () => {
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    expect(
      await screen.findByText("Actualizamos el precio de 1 libro de tu carrito."),
    ).toBeTruthy();
  });

  it("al volver a abrir el carrito ya no avisa (el precio ya es el vigente)", async () => {
    fill(CLEAN);
    const { router } = await renderApp("/carrito");
    await screen.findByText(/El precio de este libro cambió/);
    await router.navigate({ to: "/" });
    await router.navigate({ to: "/carrito" });
    await rowOf("Clean Code");
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(screen.queryByText(/El precio de este libro cambió/)).toBeNull();
  });

  it("también se actualizan el título y el autor, sin avisar", async () => {
    catalog[CLEAN.isbn] = book({ title: "Clean Code (2.ª ed.)" });
    fill(CLEAN);
    await renderApp("/carrito");
    await waitFor(() =>
      expect(cartStore.getState().linesOf(userId)[0]?.title).toBe("Clean Code (2.ª ed.)"),
    );
    expect(screen.queryByText(/cambió/)).toBeNull();
  });

  it("no tiene violaciones de accesibilidad con los avisos", async () => {
    fill(CLEAN, DDD);
    const { container } = await renderApp("/carrito");
    await screen.findByText(/El precio de este libro cambió/);
    await expectNoA11yViolations(container);
  });
});

describe("un libro dejó de estar disponible", () => {
  it.each([
    [404, "NOT_FOUND"],
    [422, "INVALID_ISBN"],
  ])(
    "un %i (%s) lo marca «No disponible», sin selector de cantidad y con «Quitar»",
    async (status, code) => {
      catalog[CLEAN.isbn] = apiError(status, code);
      fill(CLEAN, DDD);
      await renderApp("/carrito");
      const row = await rowOf("Clean Code");
      await waitFor(() => expect(within(row).getByText("No disponible")).toBeTruthy());
      expect(
        within(row).getByText("Este libro ya no está disponible. Quítalo para continuar."),
      ).toBeTruthy();
      expect(within(row).queryByLabelText("Cantidad de Clean Code")).toBeNull();
      expect(within(row).getByRole("button", { name: "Quitar Clean Code" })).toBeTruthy();
      // el otro sigue normal
      expect(
        within(await rowOf("Domain-Driven Design")).getByLabelText(
          "Cantidad de Domain-Driven Design",
        ),
      ).toBeTruthy();
    },
  );

  it("avisa arriba que hay que quitarlo para continuar", async () => {
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN);
    await renderApp("/carrito");
    expect(
      (await screen.findByText("Quita los libros no disponibles para continuar."))
        .closest("[role]")
        ?.getAttribute("role"),
    ).toBe("alert");
  });

  it("conserva el precio que tenía: no inventa uno nuevo", async () => {
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN);
    await renderApp("/carrito");
    await screen.findByText("No disponible");
    expect(cartStore.getState().linesOf(userId)[0]?.unitPrice.amount).toBe("90.00");
  });

  it("al quitarlo desaparece el aviso de arriba", async () => {
    const user = userEvent.setup();
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    await screen.findByText("Quita los libros no disponibles para continuar.");
    await user.click(screen.getByRole("button", { name: "Quitar Clean Code" }));
    await waitFor(() =>
      expect(screen.queryByText("Quita los libros no disponibles para continuar.")).toBeNull(),
    );
  });

  it("no tiene violaciones de accesibilidad", async () => {
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN, DDD);
    const { container } = await renderApp("/carrito");
    await screen.findByText("No disponible");
    await expectNoA11yViolations(container);
  });
});

describe("no se pudo comprobar", () => {
  it.each([
    ["un 500", () => apiError(500, "INTERNAL_ERROR")],
    ["la red caída", () => HttpResponse.error()],
  ])("con %s no marca nada: lo dice en la línea y no bloquea", async (_caso, respond) => {
    catalog[CLEAN.isbn] = respond() as Response;
    fill(CLEAN);
    await renderApp("/carrito");
    const row = await rowOf("Clean Code");
    await waitFor(() =>
      expect(within(row).getByText("No pudimos comprobar este libro ahora.")).toBeTruthy(),
    );
    expect(within(row).getByLabelText("Cantidad de Clean Code")).toBeTruthy();
    expect(screen.queryByText("Quita los libros no disponibles para continuar.")).toBeNull();
  });
});

describe("monedas mezcladas", () => {
  it("si un libro pasó a otra moneda, avisa y se actualiza su precio", async () => {
    catalog[CLEAN.isbn] = book({ price: { amount: "25.00", currency: "USD" } });
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    expect(
      await screen.findByText(
        "Tu carrito tiene libros en soles y en dólares. Quita los que no quieras pagar: un pedido se paga en una sola moneda.",
      ),
    ).toBeTruthy();
    const row = await rowOf("Clean Code");
    expect(within(row).getByText("25.00 USD")).toBeTruthy();
  });
});

describe("cada cuenta, lo suyo", () => {
  it("no consulta los libros del carrito de otra cuenta", async () => {
    fill(CLEAN);
    auth.addUser("luis@example.com", "LibroYa-dev-2026");
    localStorage.setItem("libroya.refresh", auth.seedSession("luis@example.com").refreshToken);
    await renderApp("/carrito");
    await screen.findByText("Tu carrito está vacío.");
    expect(requests).toEqual([]);
  });
});
