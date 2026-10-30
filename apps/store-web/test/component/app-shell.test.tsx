import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { expectNoA11yViolations } from "../support/axe.ts";
import { book, page, searchHandler } from "../support/books.ts";
import { renderApp } from "../support/render.tsx";
import { server } from "../support/server.ts";

// Desde F1 la ruta `/` carga el catálogo: estas pruebas miran el armazón, no la lista
beforeEach(() => {
  server.use(searchHandler(() => page([book()])));
});

describe("layout y cabecera", () => {
  it("tiene el enlace para saltar al contenido como primer elemento enfocable", async () => {
    const user = userEvent.setup();
    await renderApp("/");
    await user.tab();
    const skip = screen.getByRole("link", { name: "Saltar al contenido" });
    expect(document.activeElement).toBe(skip);
    expect(skip.getAttribute("href")).toBe("#contenido");
  });

  it("marca las zonas de la página: cabecera, navegación principal y contenido", async () => {
    await renderApp("/");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getByRole("main").id).toBe("contenido");
    expect(screen.getAllByRole("navigation", { name: "Principal" }).length).toBeGreaterThan(0);
  });

  it("el logotipo lleva al catálogo", async () => {
    await renderApp("/");
    const logo = within(screen.getByRole("banner")).getByRole("link", { name: "LibroYa" });
    expect(logo.getAttribute("href")).toBe("/");
  });

  it("el buscador navega a la búsqueda en la URL", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/");
    const [form] = screen.getAllByRole("search");
    const field = within(form as HTMLElement).getByLabelText("Buscar por título o autor");
    await user.type(field, "clean code{Enter}");
    expect(router.state.location.pathname).toBe("/");
    expect(router.state.location.search).toEqual({ q: "clean code", page: 1 });
  });

  it("un buscador vacío limpia la búsqueda y vuelve a la página 1", async () => {
    const user = userEvent.setup();
    const { router } = await renderApp("/?q=clean&page=3");
    const [form] = screen.getAllByRole("search");
    const field = within(form as HTMLElement).getByLabelText<HTMLInputElement>(
      "Buscar por título o autor",
    );
    expect(field.value).toBe("clean");
    await user.click(within(form as HTMLElement).getByRole("button", { name: "Borrar búsqueda" }));
    await user.click(field);
    await user.keyboard("{Enter}");
    expect(router.state.location.search).toEqual({ page: 1 });
  });

  it("el buscador de la cabecera no tiene un botón oculto: sería una parada de teclado invisible", async () => {
    await renderApp("/");
    // Solo los de la cabecera: el de la propia página (móvil) sí lleva su botón, visible
    for (const form of within(screen.getByRole("banner")).getAllByRole("search")) {
      expect(within(form).queryByRole("button", { name: "Buscar" })).toBeNull();
    }
  });

  it("descarta una página inválida de la URL en lugar de romper", async () => {
    const { router } = await renderApp("/?page=-4&q=");
    expect(router.state.location.search).toEqual({});
    expect(screen.getByRole("main")).toBeTruthy();
  });

  it("el menú móvil abre una hoja con la navegación y se cierra con Escape", async () => {
    const user = userEvent.setup();
    await renderApp("/");
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = await screen.findByRole("dialog", { name: "Menú" });
    expect(within(dialog).getByRole("link", { name: "Libros" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Devuelve el foco al botón que la abrió
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir menú" }));
  });

  it("el botón de búsqueda móvil muestra y oculta el campo", async () => {
    const user = userEvent.setup();
    await renderApp("/");
    const toggle = screen.getByRole("button", { name: "Buscar", expanded: false });
    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("buscar-movil")).toBeTruthy();
    await user.click(toggle);
    expect(document.getElementById("buscar-movil")).toBeNull();
  });
});

describe("PA-10 No encontrado", () => {
  it("una ruta inexistente muestra la pantalla con su enlace a los libros", async () => {
    await renderApp("/esto-no-existe");
    expect(
      screen.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Puede que el enlace esté incompleto o que ya no exista."),
    ).toBeTruthy();
    const link = within(screen.getByRole("main")).getByRole("link", { name: "Ir a los libros" });
    expect(link.getAttribute("href")).toBe("/");
  });

  it("conserva la cabecera para poder buscar", async () => {
    await renderApp("/otra/ruta/que/no/existe");
    expect(screen.getByRole("banner")).toBeTruthy();
    expect(screen.getAllByRole("search").length).toBeGreaterThan(0);
  });
});

describe("accesibilidad (axe, nivel AA)", () => {
  it("el catálogo provisional", async () => {
    const { container } = await renderApp("/");
    await expectNoA11yViolations(container);
  });

  it("la pantalla de no encontrado", async () => {
    const { container } = await renderApp("/nada");
    await expectNoA11yViolations(container);
  });

  it("el menú móvil abierto", async () => {
    const user = userEvent.setup();
    await renderApp("/");
    await user.click(screen.getByRole("button", { name: "Abrir menú" }));
    const dialog = await screen.findByRole("dialog", { name: "Menú" });
    await expectNoA11yViolations(dialog);
  });
});
