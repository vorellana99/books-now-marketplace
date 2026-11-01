import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CartToaster } from "@/features/cart/index.ts";
import { dismissToast, showToast, TOAST_MS, toastStore } from "@/features/cart/toast.store.ts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  act(() => dismissToast());
  vi.useRealTimers();
});

const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

describe("avisos breves del carrito", () => {
  it("duran al menos 6 segundos y luego se van solos", () => {
    render(<CartToaster />);
    act(() => showToast({ tone: "success", message: "Libro agregado" }));
    expect(screen.getByText("Libro agregado")).toBeTruthy();
    expect(TOAST_MS).toBeGreaterThanOrEqual(6000);
    advance(TOAST_MS - 1);
    expect(screen.getByText("Libro agregado")).toBeTruthy();
    advance(2);
    expect(screen.queryByText("Libro agregado")).toBeNull();
  });

  it("se detienen mientras el cursor está encima y vuelven a contar al salir", () => {
    render(<CartToaster />);
    act(() => showToast({ tone: "success", message: "Libro agregado" }));
    const toast = screen.getByRole("status", { name: "Aviso" });
    fireEvent.mouseEnter(toast);
    advance(TOAST_MS * 3);
    expect(screen.getByText("Libro agregado")).toBeTruthy();
    fireEvent.mouseLeave(toast);
    advance(TOAST_MS - 1);
    expect(screen.getByText("Libro agregado")).toBeTruthy();
    advance(2);
    expect(screen.queryByText("Libro agregado")).toBeNull();
  });

  it("se detienen mientras tienen el foco (quien usa teclado no los pierde)", () => {
    render(<CartToaster />);
    act(() =>
      showToast({
        tone: "success",
        message: "Libro agregado",
        action: { label: "Deshacer", run: () => {} },
      }),
    );
    const undo = screen.getByRole("button", { name: "Deshacer" });
    fireEvent.focus(undo);
    advance(TOAST_MS * 3);
    expect(screen.getByText("Libro agregado")).toBeTruthy();
    fireEvent.blur(undo);
    advance(TOAST_MS + 1);
    expect(screen.queryByText("Libro agregado")).toBeNull();
  });

  it("un aviso nuevo reemplaza al anterior y reinicia la cuenta", () => {
    render(<CartToaster />);
    act(() => showToast({ tone: "success", message: "Uno" }));
    advance(TOAST_MS - 100);
    act(() => showToast({ tone: "success", message: "Dos" }));
    expect(screen.queryByText("Uno")).toBeNull();
    advance(TOAST_MS - 100);
    expect(screen.getByText("Dos")).toBeTruthy();
    advance(200);
    expect(screen.queryByText("Dos")).toBeNull();
  });

  it("la acción se ejecuta una vez y cierra el aviso", () => {
    const run = vi.fn();
    render(<CartToaster />);
    act(() =>
      showToast({ tone: "success", message: "Libro agregado", action: { label: "Deshacer", run } }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Libro agregado")).toBeNull();
  });

  it("se puede cerrar a mano", () => {
    render(<CartToaster />);
    act(() => showToast({ tone: "warning", message: "Aviso" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));
    expect(screen.queryByText("Aviso")).toBeNull();
    expect(toastStore.getState().toast).toBeNull();
  });

  it("sin aviso no dibuja nada visible, pero deja la región lista para anunciar", () => {
    const { container } = render(<CartToaster />);
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
