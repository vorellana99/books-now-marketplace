import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { timing } from "@/features/cart/timing.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { deferred } from "../support/deferred.ts";
import { quoteFor, quoteHandler, type QuoteItem } from "../support/orders.ts";
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
const PRICES = { [CLEAN.isbn]: "90.00", [DDD.isbn]: "120.00" };

let auth: FakeAuth;
let userId: string;
let quotes: { items: QuoteItem[]; body: unknown }[];
let catalog: Record<string, ReturnType<typeof book> | Response>;

beforeEach(() => {
  timing.newCustomerRetryMs = 5;
  auth = new FakeAuth();
  quotes = [];
  catalog = { [CLEAN.isbn]: book(), [DDD.isbn]: book({ ...DDD, price: DDD.unitPrice }) };
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
    http.get(API("/books/:isbn"), ({ params }) => {
      const found = catalog[String(params.isbn)];
      if (found instanceof Response) return found;
      return found ? HttpResponse.json(found) : apiError(404, "NOT_FOUND");
    }),
    quoteHandler((items, body) => {
      quotes.push({ items, body });
      return quoteFor(items, PRICES);
    }),
  );
  userId = auth.signIn().user.id;
});

const fill = (...books: CartBook[]) => {
  for (const item of books) cartStore.getState().add(userId, item);
};
const summary = () => screen.findByRole("region", { name: "Resumen del pedido" });
const rowOf = async (title: string) =>
  (await screen.findByRole("heading", { name: title })).closest("li") as HTMLElement;

describe("PA-05: la cotización", () => {
  it("pide el total al backend con solo ISBN y cantidad: sin precios, sin cliente", async () => {
    fill(CLEAN, DDD);
    cartStore.getState().setQuantity(userId, CLEAN.isbn, 2);
    await renderApp("/carrito");
    await summary();
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect(quotes[0]?.body).toEqual({
      items: [
        { isbn: CLEAN.isbn, quantity: 2 },
        { isbn: DDD.isbn, quantity: 1 },
      ],
    });
    expect(JSON.stringify(quotes[0]?.body)).not.toMatch(/customerId|price|unitPrice|amount/);
  });

  it("muestra el subtotal de cada línea, el subtotal, el envío y el total que devolvió el backend", async () => {
    fill(CLEAN, DDD);
    cartStore.getState().setQuantity(userId, CLEAN.isbn, 2);
    await renderApp("/carrito");
    const box = await summary();
    const rowText = async (label: string) => {
      const row = (await within(box).findByText(label)).closest("div") as HTMLElement;
      return row.textContent ?? "";
    };
    await waitFor(async () => expect(await rowText("Subtotal")).toContain("S/ 300.00")); // 2 × 90 + 120
    expect(await rowText("Envío")).toContain("Gratis"); // desde S/ 150.00
    expect(await rowText("Total a pagar")).toContain("S/ 300.00");
    // el subtotal de cada línea
    const row = await rowOf("Clean Code");
    await within(row).findByText("S/ 180.00");
    expect(within(row).getByText("Subtotal de la línea")).toBeTruthy();
  });

  it("el envío con costo se muestra con su monto, y la pantalla explica la regla", async () => {
    fill(CLEAN);
    await renderApp("/carrito");
    const box = await summary();
    await within(box).findByText("S/ 10.00");
    expect(within(box).getByText("S/ 100.00", { selector: "dd" })).toBeTruthy(); // total: 90 + 10
    expect(
      screen.getByText(
        "Envío S/ 10.00. Gratis desde S/ 150.00 (3.00 USD y gratis desde 40.00 USD en pedidos en dólares).",
      ),
    ).toBeTruthy();
  });

  it("el descuento solo aparece cuando lo hay", async () => {
    fill(CLEAN, DDD);
    server.use(quoteHandler((items) => quoteFor(items, PRICES, { discount: "21.00" })));
    await renderApp("/carrito");
    const box = await summary();
    expect(await within(box).findByText("Descuento")).toBeTruthy();
    expect(within(box).getByText("−S/ 21.00")).toBeTruthy();
  });

  it("sin descuento no hay línea de descuento", async () => {
    fill(CLEAN);
    await renderApp("/carrito");
    const box = await summary();
    await within(box).findByText("Total a pagar");
    expect(within(box).queryByText("Descuento")).toBeNull();
  });

  it("la tienda NO calcula: muestra lo que dice el backend aunque no cuadre", async () => {
    fill(CLEAN);
    server.use(
      quoteHandler((items) => {
        const quote = quoteFor(items, PRICES);
        return { ...quote, total: { amount: "1.23", currency: "PEN" } };
      }),
    );
    await renderApp("/carrito");
    const box = await summary();
    expect(await within(box).findByText("S/ 1.23")).toBeTruthy();
    expect(within(box).queryByText("S/ 100.00", { selector: "dd" })).toBeNull();
  });

  it("recotiza al cambiar una cantidad, y mientras tanto atenúa el total y no deja continuar", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    await renderApp("/carrito");
    const box = await summary();
    await within(box).findByText("S/ 100.00", { selector: "dd" });
    const gate = deferred();
    server.use(
      quoteHandler(async (items) => {
        quotes.push({ items, body: { items } });
        await gate.promise;
        return quoteFor(items, PRICES);
      }),
    );
    await user.selectOptions(screen.getByLabelText("Cantidad de Clean Code"), "2");
    await waitFor(() => expect(box.getAttribute("aria-busy")).toBe("true"));
    // el total anterior sigue a la vista, atenuado
    expect(within(box).getByText("S/ 100.00", { selector: "dd" })).toBeTruthy();
    const next = screen.getByRole("button", { name: "Continuar con la compra" });
    expect(next.getAttribute("aria-disabled")).toBe("true");
    gate.release();
    // 2 × 90 = 180: ya pasa de S/ 150.00 y el envío es gratis
    await waitFor(() =>
      expect(within(box).getByText("Total a pagar").closest("div")?.textContent).toContain(
        "S/ 180.00",
      ),
    );
    await waitFor(() => expect(box.getAttribute("aria-busy")).not.toBe("true"));
  });

  it("«Continuar con la compra» lleva a PA-06 cuando el total está vigente", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    const { router } = await renderApp("/carrito");
    const box = await summary();
    await within(box).findByText("S/ 100.00", { selector: "dd" });
    await user.click(screen.getByRole("link", { name: "Continuar con la compra" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/compra"));
  });

  it("no tiene violaciones de accesibilidad con el resumen", async () => {
    fill(CLEAN, DDD);
    const { container } = await renderApp("/carrito");
    const box = await summary();
    await within(box).findByText("Total a pagar");
    await waitFor(() => expect(box.getAttribute("aria-busy")).not.toBe("true"));
    await expectNoA11yViolations(container);
  });
});

describe("PA-05: si la cotización falla", () => {
  it.each([
    ["un 500", () => apiError(500, "INTERNAL_ERROR")],
    ["la red caída", () => HttpResponse.error()],
  ])(
    "con %s dice «No pudimos calcular tu total», deja reintentar y no deja continuar",
    async (_caso, respond) => {
      const user = userEvent.setup();
      fill(CLEAN);
      let fail = true;
      server.use(
        http.post(API("/orders/quote"), async ({ request }) => {
          const body = (await request.json()) as { items: QuoteItem[] };
          return fail ? (respond() as Response) : HttpResponse.json(quoteFor(body.items, PRICES));
        }),
      );
      await renderApp("/carrito");
      expect(await screen.findByText("No pudimos calcular tu total.")).toBeTruthy();
      expect(screen.queryByRole("link", { name: "Continuar con la compra" })).toBeNull();
      expect(
        (screen.getByRole("button", { name: "Continuar con la compra" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      fail = false;
      await user.click(screen.getByRole("button", { name: "Reintentar" }));
      expect(
        await within(await summary()).findByText("S/ 100.00", { selector: "dd" }),
      ).toBeTruthy();
      expect(screen.getByRole("link", { name: "Continuar con la compra" })).toBeTruthy();
    },
  );

  it("un 404 (el cliente de Ventas aún no existe tras registrarse) se reintenta una vez", async () => {
    fill(CLEAN);
    let calls = 0;
    server.use(
      http.post(API("/orders/quote"), async ({ request }) => {
        calls += 1;
        const body = (await request.json()) as { items: QuoteItem[] };
        return calls === 1
          ? apiError(404, "NOT_FOUND")
          : HttpResponse.json(quoteFor(body.items, PRICES));
      }),
    );
    await renderApp("/carrito");
    expect(await within(await summary()).findByText("S/ 100.00", { selector: "dd" })).toBeTruthy();
    expect(calls).toBe(2);
    expect(screen.queryByText("No pudimos calcular tu total.")).toBeNull();
  });

  it("si el 404 persiste, muestra el error y no reintenta sin fin", async () => {
    fill(CLEAN);
    let calls = 0;
    server.use(
      http.post(API("/orders/quote"), () => {
        calls += 1;
        return apiError(404, "NOT_FOUND");
      }),
    );
    await renderApp("/carrito");
    expect(await screen.findByText("No pudimos calcular tu total.")).toBeTruthy();
    expect(calls).toBe(2);
  });
});

describe("PA-05: cuándo no se cotiza", () => {
  it("un carrito vacío no pide nada ni dibuja el resumen", async () => {
    await renderApp("/carrito");
    await screen.findByText("Tu carrito está vacío.");
    expect(quotes).toEqual([]);
    expect(screen.queryByRole("region", { name: "Resumen del pedido" })).toBeNull();
  });

  it("con un libro no disponible no cotiza: pide quitarlo", async () => {
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    expect(
      await screen.findByText("Quita los libros no disponibles para ver tu total."),
    ).toBeTruthy();
    expect(quotes).toEqual([]);
    expect(
      (screen.getByRole("button", { name: "Continuar con la compra" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("al quitar el libro no disponible, cotiza lo que queda", async () => {
    const user = userEvent.setup();
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    await screen.findByText("Quita los libros no disponibles para ver tu total.");
    await user.click(screen.getByRole("button", { name: "Quitar Clean Code" }));
    await waitFor(() => expect(quotes).toHaveLength(1));
    expect(quotes[0]?.items).toEqual([{ isbn: DDD.isbn, quantity: 1 }]);
  });

  it("con monedas mezcladas no cotiza", async () => {
    catalog[CLEAN.isbn] = book({ price: { amount: "25.00", currency: "USD" } });
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    await screen.findByText(/soles y en dólares/);
    expect(quotes).toEqual([]);
  });
});
