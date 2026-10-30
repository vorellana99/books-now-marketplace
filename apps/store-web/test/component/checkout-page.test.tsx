import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { timing } from "@/features/cart/timing.ts";
import { ADDRESS_KEY } from "@/features/checkout/address.store.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book, bookNumber, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { quoteFor, quoteHandler } from "../support/orders.ts";
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
let catalog: Record<string, ReturnType<typeof book> | Response>;
beforeEach(() => {
  timing.newCustomerRetryMs = 5;
  auth = new FakeAuth();
  catalog = { [CLEAN.isbn]: book(), [DDD.isbn]: book({ ...DDD, price: DDD.unitPrice }) };
  server.use(
    ...auth.handlers(),
    searchHandler(() => page([bookNumber(1)])),
    http.get(API("/books/:isbn"), ({ params }) => {
      const found = catalog[String(params.isbn)];
      if (found instanceof Response) return found;
      return found ? HttpResponse.json(found) : apiError(404, "NOT_FOUND");
    }),
    quoteHandler((items) => quoteFor(items, PRICES)),
  );
  userId = auth.signIn().user.id;
});

const fill = (...books: CartBook[]) => {
  for (const item of books) cartStore.getState().add(userId, item);
};
const open = async () => {
  const app = await renderApp("/compra");
  await screen.findByRole("heading", { name: "Finaliza tu compra", level: 1 });
  return app;
};

describe("PA-06: la pantalla", () => {
  it("tiene el título, la sección de envío con su formulario y el resumen del pedido", async () => {
    fill(CLEAN);
    await open();
    expect(screen.getByRole("heading", { name: "Envío", level: 2 })).toBeTruthy();
    expect(screen.getByLabelText("Destinatario")).toBeTruthy();
    expect(await screen.findByRole("region", { name: "Resumen del pedido" })).toBeTruthy();
    await waitFor(() => expect(document.title).toBe("Pagar · LibroYa"));
  });

  it("el botón de pagar dice el monto de la cotización vigente", async () => {
    fill(CLEAN);
    await open();
    expect(await screen.findByRole("button", { name: "Pagar S/ 100.00" })).toBeTruthy(); // 90 + 10 de envío
  });

  it("mientras cotiza, «Pagar» está deshabilitado", async () => {
    fill(CLEAN);
    server.use(
      http.post(API("/orders/quote"), async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return HttpResponse.json(quoteFor([{ isbn: CLEAN.isbn, quantity: 1 }], PRICES));
      }),
    );
    await open();
    expect((screen.getByRole("button", { name: "Pagar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(await screen.findByRole("button", { name: "Pagar S/ 100.00" })).toBeTruthy();
  });

  it("si la cotización falla no se puede pagar y se puede reintentar", async () => {
    fill(CLEAN);
    server.use(http.post(API("/orders/quote"), () => apiError(500, "INTERNAL_ERROR")));
    await open();
    expect(await screen.findByText("No pudimos calcular tu total.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Pagar" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });

  it("tiene un enlace para volver al carrito", async () => {
    fill(CLEAN);
    await open();
    expect(screen.getByRole("link", { name: "Volver al carrito" }).getAttribute("href")).toBe(
      "/carrito",
    );
  });

  it("no tiene violaciones de accesibilidad", async () => {
    fill(CLEAN, DDD);
    const { container } = await open();
    await screen.findByRole("button", { name: /^Pagar S\// });
    await expectNoA11yViolations(container);
  });
});

describe("PA-06: cuándo no se puede pagar", () => {
  it("con el carrito vacío lo dice y lleva al catálogo", async () => {
    await renderApp("/compra");
    expect(await screen.findByText("Tu carrito está vacío.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver libros" }).getAttribute("href")).toBe("/");
    expect(screen.queryByLabelText("Destinatario")).toBeNull();
  });

  it("con un libro no disponible pide volver al carrito a quitarlo, y no muestra el formulario", async () => {
    catalog[CLEAN.isbn] = apiError(404, "NOT_FOUND");
    fill(CLEAN);
    await renderApp("/compra");
    expect(
      await screen.findByText(
        "Hay libros en tu carrito que ya no están disponibles. Quítalos para continuar.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al carrito" }).getAttribute("href")).toBe(
      "/carrito",
    );
    expect(screen.queryByLabelText("Destinatario")).toBeNull();
  });

  it("sin sesión pide entrar, con la ruta de origen", async () => {
    localStorage.clear();
    const { router } = await renderApp("/compra");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    expect(router.state.location.search).toMatchObject({ returnTo: "/compra" });
  });
});

describe("PA-06: la dirección durante la compra en curso", () => {
  it("empieza vacía en cada compra", async () => {
    fill(CLEAN);
    await open();
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).value).toBe("");
  });

  it("se conserva al volver al carrito y regresar a pagar", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    const { router } = await open();
    await user.type(screen.getByLabelText("Destinatario"), "María Quispe");
    await user.type(screen.getByLabelText("Dirección"), "Jr. Ucayali 150");
    await user.click(screen.getByRole("link", { name: "Volver al carrito" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/carrito"));
    await router.navigate({ to: "/compra" });
    await screen.findByRole("heading", { name: "Finaliza tu compra" });
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).value).toBe("María Quispe");
    expect((screen.getByLabelText("Dirección") as HTMLInputElement).value).toBe("Jr. Ucayali 150");
  });

  it("vive solo en la pestaña (sessionStorage), no en localStorage: no se recuerda entre visitas (DP-13)", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    await open();
    await user.type(screen.getByLabelText("Destinatario"), "María Quispe");
    expect(sessionStorage.getItem(ADDRESS_KEY)).toContain("María Quispe");
    expect(localStorage.getItem(ADDRESS_KEY)).toBeNull();
  });

  it("es de cada cuenta: otra persona del mismo equipo la ve vacía", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    const first = await open();
    await user.type(screen.getByLabelText("Destinatario"), "María Quispe");
    first.unmount();
    auth.addUser("luis@example.com", "LibroYa-dev-2026");
    localStorage.setItem("libroya.refresh", auth.seedSession("luis@example.com").refreshToken);
    cartStore.getState().add(auth.users.get("luis@example.com")!.id, CLEAN);
    await open();
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).value).toBe("");
  });

  it("un borrador manipulado se descarta sin romper la pantalla", async () => {
    sessionStorage.setItem(ADDRESS_KEY, "{no es json");
    fill(CLEAN);
    await open();
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).value).toBe("");
  });

  it("«Pagar» con la dirección incompleta avisa junto a cada campo y no hace nada más", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    await open();
    await user.click(await screen.findByRole("button", { name: "Pagar S/ 100.00" }));
    expect(await screen.findByText("Escribe el nombre de quien recibe.")).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByText(/Procesando/)).toBeNull();
  });
});

describe("PA-06: la tarjeta de prueba", () => {
  it("fuera de producción hay un selector de tarjeta de prueba: aprobada, rechazada o error del servidor", async () => {
    fill(CLEAN);
    await open();
    const select = (await screen.findByLabelText("Tarjeta de prueba")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "Aprobada",
      "Rechazada",
      "Error del servidor",
    ]);
    expect(select.value).toBe("tok_visa");
    expect([...select.options].map((o) => o.value)).toEqual([
      "tok_visa",
      "tok_declined",
      "tok_error",
    ]);
  });

  it("dice que la tarjeta real nunca pasa por LibroYa", async () => {
    fill(CLEAN);
    await open();
    expect(
      await screen.findByText(/El número de tu tarjeta nunca se envía a LibroYa/),
    ).toBeTruthy();
  });
});
