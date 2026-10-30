import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore, type CartBook } from "@/features/cart/cart.store.ts";
import { FakeAuth } from "../support/auth.ts";
import { book, bookNumber, detailHandler, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
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
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    // al abrir el carrito se vuelven a consultar los libros (F3.4): aquí siguen igual
    detailHandler((isbn) => (isbn === DDD.isbn ? book({ ...DDD, price: DDD.unitPrice }) : book())),
    searchHandler(() => page([bookNumber(1)])),
  );
  userId = auth.signIn().user.id;
});

const fill = (...books: CartBook[]) => {
  for (const item of books) cartStore.getState().add(userId, item);
};
const rowOf = async (title: string) =>
  (await screen.findByRole("heading", { name: title })).closest("li") as HTMLElement;

describe("PA-05 Carrito: las líneas", () => {
  it("muestra cada libro con título (enlace a su página), autor, precio unitario y cantidad", async () => {
    fill(CLEAN, DDD);
    cartStore.getState().setQuantity(userId, CLEAN.isbn, 3);
    await renderApp("/carrito");
    expect(await screen.findByRole("heading", { name: "Tu carrito", level: 1 })).toBeTruthy();
    const row = await rowOf("Clean Code");
    expect(within(row).getByRole("link", { name: "Clean Code" }).getAttribute("href")).toBe(
      "/libros/9780132350884",
    );
    expect(within(row).getByText("Robert C. Martin", { selector: "p" })).toBeTruthy();
    expect(within(row).getByText("S/ 90.00")).toBeTruthy();
    expect((within(row).getByLabelText("Cantidad de Clean Code") as HTMLSelectElement).value).toBe(
      "3",
    );
    const other = await rowOf("Domain-Driven Design");
    expect(within(other).getByText("S/ 120.00")).toBeTruthy();
  });

  it("las líneas salen en el orden en que se agregaron", async () => {
    fill(DDD, CLEAN);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual(["Domain-Driven Design", "Clean Code"]);
  });

  it("el selector de cantidad ofrece de 1 a 10", async () => {
    fill(CLEAN);
    await renderApp("/carrito");
    const select = (await screen.findByLabelText("Cantidad de Clean Code")) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
    ]);
  });

  it("un precio en dólares se muestra en dólares", async () => {
    fill({ ...CLEAN, unitPrice: { amount: "22.50", currency: "USD" } });
    server.use(detailHandler(() => book({ price: { amount: "22.50", currency: "USD" } })));
    await renderApp("/carrito");
    expect(await screen.findByText("22.50 USD")).toBeTruthy();
  });

  it("no muestra totales: llegan con la cotización (F4), y la tienda no calcula montos (RN-08)", async () => {
    fill(CLEAN);
    cartStore.getState().setQuantity(userId, CLEAN.isbn, 3);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    expect(screen.queryByText(/270\.00/)).toBeNull();
    expect(screen.queryByText(/Total/i)).toBeNull();
  });

  it("el título de la pestaña dice dónde se está", async () => {
    fill(CLEAN);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    await waitFor(() => expect(document.title).toBe("Carrito · LibroYa"));
  });

  it("no tiene violaciones de accesibilidad", async () => {
    fill(CLEAN, DDD);
    const { container } = await renderApp("/carrito");
    await rowOf("Clean Code");
    await expectNoA11yViolations(container);
  });
});

describe("PA-05 Carrito: cambiar la cantidad", () => {
  it("al elegir otra cantidad se guarda en el carrito", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    await renderApp("/carrito");
    await user.selectOptions(await screen.findByLabelText("Cantidad de Clean Code"), "7");
    expect(cartStore.getState().linesOf(userId)[0]?.quantity).toBe(7);
    expect((screen.getByLabelText("Cantidad de Clean Code") as HTMLSelectElement).value).toBe("7");
  });

  it("el contador de la cabecera la sigue", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    await renderApp("/carrito");
    await user.selectOptions(await screen.findByLabelText("Cantidad de Clean Code"), "4");
    expect(
      await within(screen.getByRole("banner")).findByRole("link", { name: "Carrito, 4 libros" }),
    ).toBeTruthy();
  });
});

describe("PA-05 Carrito: quitar y deshacer", () => {
  it("quitar saca el libro y avisa con «Deshacer»", async () => {
    const user = userEvent.setup();
    fill(CLEAN, DDD);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    await user.click(screen.getByRole("button", { name: "Quitar Clean Code" }));
    expect(screen.queryByRole("heading", { name: "Clean Code" })).toBeNull();
    expect(
      cartStore
        .getState()
        .linesOf(userId)
        .map((l) => l.isbn),
    ).toEqual([DDD.isbn]);
    const toast = await screen.findByRole("status", { name: "Aviso" });
    expect(within(toast).getByText("Quitado del carrito")).toBeTruthy();
    expect(within(toast).getByRole("button", { name: "Deshacer" })).toBeTruthy();
  });

  it("deshacer lo devuelve a su lugar, con su cantidad", async () => {
    const user = userEvent.setup();
    fill(CLEAN, DDD);
    cartStore.getState().setQuantity(userId, CLEAN.isbn, 4);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    await user.click(screen.getByRole("button", { name: "Quitar Clean Code" }));
    await user.click(
      within(await screen.findByRole("status", { name: "Aviso" })).getByRole("button", {
        name: "Deshacer",
      }),
    );
    const titles = (await screen.findAllByRole("heading", { level: 3 })).map((h) => h.textContent);
    expect(titles).toEqual(["Clean Code", "Domain-Driven Design"]);
    expect((screen.getByLabelText("Cantidad de Clean Code") as HTMLSelectElement).value).toBe("4");
  });

  it("al quitar el último libro, el carrito queda vacío con un enlace al catálogo", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    await renderApp("/carrito");
    await rowOf("Clean Code");
    await user.click(screen.getByRole("button", { name: "Quitar Clean Code" }));
    expect(await screen.findByText("Tu carrito está vacío.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver libros" }).getAttribute("href")).toBe("/");
    // y se puede deshacer desde el estado vacío
    await user.click(
      within(await screen.findByRole("status", { name: "Aviso" })).getByRole("button", {
        name: "Deshacer",
      }),
    );
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
  });
});

describe("PA-05 Carrito: vacío", () => {
  it("un carrito sin libros lo dice y lleva al catálogo", async () => {
    const { container } = await renderApp("/carrito");
    expect(await screen.findByRole("heading", { name: "Tu carrito", level: 1 })).toBeTruthy();
    expect(screen.getByText("Tu carrito está vacío.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver libros" }).getAttribute("href")).toBe("/");
    await expectNoA11yViolations(container);
  });
});

describe("PA-05 Carrito: persistencia y cuentas", () => {
  it("sobrevive a recargar la página", async () => {
    fill(CLEAN, DDD);
    const first = await renderApp("/carrito");
    await rowOf("Clean Code");
    first.unmount();
    await renderApp("/carrito");
    expect(await screen.findByRole("heading", { name: "Domain-Driven Design" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Clean Code" })).toBeTruthy();
  });

  it("no se mezcla con el de otra cuenta del mismo equipo", async () => {
    fill(CLEAN);
    auth.addUser("luis@example.com", "LibroYa-dev-2026");
    localStorage.setItem("libroya.refresh", auth.seedSession("luis@example.com").refreshToken);
    await renderApp("/carrito");
    expect(await screen.findByText("Tu carrito está vacío.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Clean Code" })).toBeNull();
  });

  it("cerrar sesión conserva el carrito, y al volver a entrar sigue ahí", async () => {
    const user = userEvent.setup();
    fill(CLEAN);
    const { router } = await renderApp("/carrito");
    await rowOf("Clean Code");
    await user.click(
      await within(screen.getByRole("banner")).findByRole("button", { name: "Mi cuenta" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(cartStore.getState().linesOf(userId)).toHaveLength(1);
    await user.click(
      await within(screen.getByRole("banner")).findByRole("link", { name: "Entrar" }),
    );
    await user.type(await screen.findByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await router.navigate({ to: "/carrito" });
    expect(await screen.findByRole("heading", { name: "Clean Code" })).toBeTruthy();
  });

  it("sin sesión pide entrar", async () => {
    localStorage.clear();
    const { router } = await renderApp("/carrito");
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    expect(router.state.location.pathname).toBe("/ingresar");
  });
});
