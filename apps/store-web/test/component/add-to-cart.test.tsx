import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { cartStore } from "@/features/cart/cart.store.ts";
import { FakeAuth } from "../support/auth.ts";
import { book, bookNumber, detailHandler, page, searchHandler } from "../support/books.ts";
import { expectNoA11yViolations } from "../support/axe.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

let auth: FakeAuth;
let userId: string;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(
    ...auth.handlers(),
    detailHandler(() => book()),
    searchHandler(() => page([book(), bookNumber(2)], { total: 2 })),
  );
});

const signIn = () => {
  const login = auth.signIn();
  userId = login.user.id;
};
const linesOfUser = () => cartStore.getState().linesOf(userId);

describe("PA-02: agregar al carrito", () => {
  it("con sesión el libro entra con cantidad 1, se confirma y se puede deshacer", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));

    expect(linesOfUser()).toEqual([
      {
        isbn: "9780132350884",
        title: "Clean Code",
        author: "Robert C. Martin",
        unitPrice: { amount: "90.00", currency: "PEN" },
        quantity: 1,
      },
    ]);
    const toast = await screen.findByRole("status", { name: "Aviso" });
    expect(within(toast).getByText("Libro agregado")).toBeTruthy();
    expect(within(toast).getByRole("button", { name: "Deshacer" })).toBeTruthy();
  });

  it("después de agregar, el botón dice «Agregar otro (1)» y aparece el enlace «Ver carrito»", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    expect(screen.queryByRole("link", { name: "Ver carrito" })).toBeNull();
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    expect(await screen.findByRole("button", { name: "Agregar otro (1)" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver carrito" }).getAttribute("href")).toBe("/carrito");
  });

  it("agregarlo otra vez sube su cantidad en 1", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    await user.click(await screen.findByRole("button", { name: "Agregar otro (1)" }));
    expect(linesOfUser()[0]?.quantity).toBe(2);
    expect(await screen.findByRole("button", { name: "Agregar otro (2)" })).toBeTruthy();
  });

  it("Deshacer quita la unidad que se acaba de agregar", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    await user.click(await screen.findByRole("button", { name: "Agregar otro (1)" }));
    await user.click(
      within(await screen.findByRole("status", { name: "Aviso" })).getByRole("button", {
        name: "Deshacer",
      }),
    );
    expect(linesOfUser()[0]?.quantity).toBe(1);
    await user.click(await screen.findByRole("button", { name: "Agregar otro (1)" }));
    await user.click(
      within(await screen.findByRole("status", { name: "Aviso" })).getByRole("button", {
        name: "Deshacer",
      }),
    );
    expect(linesOfUser()[0]?.quantity).toBe(1);
  });

  it("deshacer la primera unidad saca el libro del carrito", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    await user.click(
      within(await screen.findByRole("status", { name: "Aviso" })).getByRole("button", {
        name: "Deshacer",
      }),
    );
    expect(linesOfUser()).toEqual([]);
    expect(await screen.findByRole("button", { name: "Agregar al carrito" })).toBeTruthy();
  });

  it("con 10 unidades el botón se deshabilita y explica el tope (RN-10)", async () => {
    signIn();
    for (let n = 0; n < 10; n += 1) {
      cartStore.getState().add(userId, {
        isbn: "9780132350884",
        title: "Clean Code",
        author: "Robert C. Martin",
        unitPrice: { amount: "90.00", currency: "PEN" },
      });
    }
    await renderApp("/libros/9780132350884");
    const button = await screen.findByRole("button", { name: /Agregar otro \(10\)/ });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Máximo 10 unidades por libro en cada pedido.")).toBeTruthy();
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("un libro en otra moneda no entra y se avisa (RN-05)", async () => {
    const user = userEvent.setup();
    signIn();
    cartStore.getState().add(userId, {
      isbn: "9780000000001",
      title: "Otro",
      author: "A",
      unitPrice: { amount: "10.00", currency: "USD" },
    });
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    expect(linesOfUser().map((l) => l.isbn)).toEqual(["9780000000001"]);
    const toast = await screen.findByRole("status", { name: "Aviso" });
    expect(toast.textContent).toContain(
      "No puedes pagar libros en soles y en dólares en un mismo pedido.",
    );
    expect(within(toast).queryByRole("button", { name: "Deshacer" })).toBeNull();
  });

  it("sin sesión lleva a iniciar sesión con el aviso, sin agregar nada", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({
      aviso: "carrito",
      returnTo: "/libros/9780132350884",
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "Entra para armar tu carrito.",
    );
    expect(cartStore.getState().byUser).toEqual({});
  });

  it("tras entrar vuelve al libro y NO se agrega solo (DP-12)", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    await screen.findByRole("heading", { name: "Entra a tu cuenta" });
    await user.type(screen.getByLabelText("Correo electrónico"), "ana@example.com");
    await user.type(screen.getByLabelText("Contraseña"), "LibroYa-dev-2026");
    await user.click(screen.getByRole("button", { name: "Entrar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/libros/9780132350884"));
    expect(await screen.findByRole("button", { name: "Agregar al carrito" })).toBeTruthy();
    expect(cartStore.getState().byUser).toEqual({});
  });

  it("no tiene violaciones de accesibilidad, con el aviso", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    await screen.findByRole("status", { name: "Aviso" });
    await expectNoA11yViolations(document.body);
  });
});

describe("PA-01: agregar desde la tarjeta", () => {
  const cardOf = async (title: string) =>
    (await screen.findByRole("heading", { name: title })).closest("article") as HTMLElement;

  it("cada tarjeta tiene su botón «Agregar», con el nombre del libro", async () => {
    signIn();
    await renderApp("/");
    const card = await cardOf("Clean Code");
    expect(
      within(card).getByRole("button", { name: "Agregar Clean Code al carrito" }),
    ).toBeTruthy();
  });

  it("con sesión agrega el libro y la tarjeta pasa a «Agregar otro»", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/");
    const card = await cardOf("Clean Code");
    await user.click(within(card).getByRole("button", { name: "Agregar Clean Code al carrito" }));
    expect(linesOfUser().map((l) => [l.isbn, l.quantity])).toEqual([["9780132350884", 1]]);
    expect(
      await within(card).findByRole("button", {
        name: "Agregar otro ejemplar de Clean Code (1 en el carrito)",
      }),
    ).toBeTruthy();
    expect(await screen.findByRole("status", { name: "Aviso" })).toBeTruthy();
    // el otro libro no cambió
    const other = await cardOf("Libro 02");
    expect(within(other).getByRole("button", { name: "Agregar Libro 02 al carrito" })).toBeTruthy();
  });

  it("el botón no navega: sigue en el catálogo", async () => {
    const user = userEvent.setup();
    signIn();
    const { router } = await renderApp("/");
    const card = await cardOf("Clean Code");
    await user.click(within(card).getByRole("button", { name: "Agregar Clean Code al carrito" }));
    expect(router.state.location.pathname).toBe("/");
  });

  it("sin sesión lleva a iniciar sesión y vuelve a la misma búsqueda y página", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/?q=clean&page=1");
    const card = await cardOf("Clean Code");
    await user.click(within(card).getByRole("button", { name: "Agregar Clean Code al carrito" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({
      aviso: "carrito",
      returnTo: "/?q=clean&page=1",
    });
    expect(cartStore.getState().byUser).toEqual({});
  });

  it("con 10 unidades la tarjeta deshabilita el botón", async () => {
    signIn();
    for (let n = 0; n < 10; n += 1) {
      cartStore.getState().add(userId, {
        isbn: "9780132350884",
        title: "Clean Code",
        author: "Robert C. Martin",
        unitPrice: { amount: "90.00", currency: "PEN" },
      });
    }
    await renderApp("/");
    const card = await cardOf("Clean Code");
    const button = within(card).getByRole("button", { name: /Clean Code/ }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(within(card).getByText("Máximo 10 por pedido.")).toBeTruthy();
  });

  it("no tiene violaciones de accesibilidad", async () => {
    signIn();
    const { container } = await renderApp("/");
    await cardOf("Clean Code");
    await expectNoA11yViolations(container);
  });
});

describe("contador del carrito en la cabecera", () => {
  const cartLink = () =>
    within(screen.getByRole("banner")).findByRole("link", { name: /^Carrito/ });
  const withUnits = (units: number) => {
    for (let n = 0; n < units; n += 1) {
      cartStore.getState().add(userId, {
        isbn: "9780132350884",
        title: "Clean Code",
        author: "Robert C. Martin",
        unitPrice: { amount: "90.00", currency: "PEN" },
      });
    }
  };

  it("sin libros dice solo «Carrito» y no muestra número", async () => {
    signIn();
    await renderApp("/");
    const link = await cartLink();
    expect(link.getAttribute("href")).toBe("/carrito");
    expect(link.textContent).toBe("Carrito");
  });

  it.each([
    [1, "Carrito, 1 libro"],
    [3, "Carrito, 3 libros"],
  ])("con %i unidades dice «%s»", async (units, name) => {
    signIn();
    withUnits(units);
    await renderApp("/");
    expect(await within(screen.getByRole("banner")).findByRole("link", { name })).toBeTruthy();
  });

  it("se actualiza al agregar, y se anuncia en una región educada (aria-live)", async () => {
    const user = userEvent.setup();
    signIn();
    await renderApp("/libros/9780132350884");
    await user.click(await screen.findByRole("button", { name: "Agregar al carrito" }));
    const link = await within(screen.getByRole("banner")).findByRole("link", {
      name: "Carrito, 1 libro",
    });
    expect(link.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");
  });

  it("sin sesión el carrito aparece y lleva a iniciar sesión, sin contador", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/");
    const link = await cartLink();
    expect(link.textContent).toBe("Carrito");
    await user.click(link);
    await waitFor(() => expect(router.state.location.pathname).toBe("/ingresar"));
    expect(router.state.location.search).toMatchObject({ returnTo: "/carrito" });
  });

  it("el carrito es de cada cuenta: otra persona del mismo equipo no ve el contador de la anterior", async () => {
    signIn();
    withUnits(2);
    auth.addUser("luis@example.com", "LibroYa-dev-2026");
    localStorage.setItem("libroya.refresh", auth.seedSession("luis@example.com").refreshToken);
    await renderApp("/");
    const link = await cartLink();
    await waitFor(() => expect(link.textContent).toBe("Carrito"));
  });
});
