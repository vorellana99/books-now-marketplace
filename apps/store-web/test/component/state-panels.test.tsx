import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { Alert } from "@/shared/ui/alert.tsx";
import { EmptyState, ErrorState } from "@/shared/ui/state-panel.tsx";
import { expectNoA11yViolations } from "../support/axe.ts";

describe("estados base", () => {
  it("vacío: mensaje y acción", async () => {
    const { container } = render(
      <EmptyState
        title="Tu carrito está vacío"
        description="Cuando agregues libros, aparecerán aquí."
        action={<a href="/">Ver libros</a>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Tu carrito está vacío" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ver libros" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("error: reintentar y código de soporte", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container } = render(<ErrorState onRetry={onRetry} supportCode="7c1e4a90-3b2d" />);
    expect(screen.getByRole("heading", { name: "Algo salió mal" })).toBeTruthy();
    expect(screen.getByText("7c1e4a90-3b2d")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoA11yViolations(container);
  });

  it("error sin código ni reintento no muestra botones ni código", () => {
    render(<ErrorState />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByText(/Código de soporte/)).toBeNull();
  });
});

describe("Alert", () => {
  it("un error o un aviso se anuncian de inmediato; lo informativo, sin interrumpir", () => {
    render(
      <>
        <Alert variant="error">error</Alert>
        <Alert variant="warning">aviso</Alert>
        <Alert variant="info">info</Alert>
        <Alert variant="success">ok</Alert>
      </>,
    );
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["error", "aviso"]);
    expect(screen.getAllByRole("status").map((a) => a.textContent)).toEqual(["info", "ok"]);
  });

  it("muestra el título y la acción", async () => {
    const { container } = render(
      <Alert
        variant="error"
        title="Tu tarjeta fue rechazada"
        action={<button type="button">Cambiar tarjeta</button>}
      >
        No se te cobró nada.
      </Alert>,
    );
    expect(screen.getByText("Tu tarjeta fue rechazada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambiar tarjeta" })).toBeTruthy();
    await expectNoA11yViolations(container);
  });
});
