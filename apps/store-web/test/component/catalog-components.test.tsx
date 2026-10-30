import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { BookCover, coverToneOf } from "@/shared/ui/book-cover.tsx";
import { Pagination } from "@/shared/ui/pagination.tsx";
import { Price } from "@/shared/ui/price.tsx";
import { expectNoA11yViolations } from "../support/axe.ts";

describe("BookCover (portada tipográfica)", () => {
  it("el mismo ISBN siempre tiene el mismo color, y hay seis tonos", () => {
    expect(coverToneOf("9780132350884")).toBe(coverToneOf("9780132350884"));
    const tones = new Set(
      Array.from({ length: 200 }, (_, n) => coverToneOf(`97800000${String(n).padStart(5, "0")}`)),
    );
    expect(tones.size).toBe(6);
    for (const tone of tones) expect(tone).toBeGreaterThanOrEqual(0);
    for (const tone of tones) expect(tone).toBeLessThan(6);
  });

  it("es decorativa: el título y el autor ya están en el texto de al lado", () => {
    const { container } = render(
      <BookCover isbn="9780132350884" title="Clean Code" author="Robert C. Martin" />,
    );
    const cover = container.firstElementChild as HTMLElement;
    expect(cover.getAttribute("aria-hidden")).toBe("true");
    expect(cover.textContent).toContain("Clean Code");
  });

  it("tiene tres tamaños", () => {
    for (const size of ["sm", "md", "lg"] as const) {
      const { container, unmount } = render(
        <BookCover isbn="9780132350884" title="Clean Code" author="Robert C. Martin" size={size} />,
      );
      expect((container.firstElementChild as HTMLElement).dataset.size).toBe(size);
      unmount();
    }
  });
});

describe("Price", () => {
  it("muestra el monto con el formato de la tienda, sin pasar por number", () => {
    render(<Price money={{ amount: "1250.00", currency: "PEN" }} />);
    expect(screen.getByText("S/ 1,250.00")).toBeTruthy();
  });

  it("en dólares, el monto va antes que la moneda", () => {
    render(<Price money={{ amount: "90.00", currency: "USD" }} />);
    expect(screen.getByText("90.00 USD")).toBeTruthy();
  });

  it("lleva cifras tabulares", () => {
    render(<Price money={{ amount: "90.00", currency: "PEN" }} />);
    expect(screen.getByText("S/ 90.00").className).toContain("money");
  });
});

describe("Pagination", () => {
  it("dice en qué página está y cuántas hay", () => {
    render(<Pagination page={2} pageCount={5} onChange={() => {}} />);
    expect(screen.getByRole("navigation", { name: "Paginación" })).toBeTruthy();
    expect(screen.getByText("Página 2 de 5")).toBeTruthy();
  });

  it("en la primera página, Anterior está deshabilitado de verdad", () => {
    render(<Pagination page={1} pageCount={3} onChange={() => {}} />);
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("en la última página, Siguiente está deshabilitado de verdad", () => {
    render(<Pagination page={3} pageCount={3} onChange={() => {}} />);
    expect((screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("pide la página anterior o la siguiente", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={2} pageCount={3} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Siguiente" }));
    await user.click(screen.getByRole("button", { name: "Anterior" }));
    expect(onChange.mock.calls).toEqual([[3], [1]]);
  });

  it("con una sola página no se dibuja", () => {
    const { container } = render(<Pagination page={1} pageCount={1} onChange={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it("no tiene violaciones de accesibilidad", async () => {
    const { container } = render(<Pagination page={2} pageCount={3} onChange={() => {}} />);
    await expectNoA11yViolations(container);
  });
});
