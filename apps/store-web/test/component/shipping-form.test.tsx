import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { ShippingForm } from "@/features/checkout/components/shipping-form.tsx";
import { expectNoA11yViolations } from "../support/axe.ts";

const setup = (props: Partial<Parameters<typeof ShippingForm>[0]> = {}) => {
  const onSubmit = vi.fn();
  const onChange = vi.fn();
  const utils = render(
    <>
      <ShippingForm onSubmit={onSubmit} onChange={onChange} {...props} />
      <button type="submit" form="shipping-form">
        Pagar
      </button>
    </>,
  );
  return { onSubmit, onChange, user: userEvent.setup(), ...utils };
};

const fillAll = async (
  user: ReturnType<typeof userEvent.setup>,
  overrides: Record<string, string> = {},
) => {
  const values: Record<string, string> = {
    Destinatario: "  María Quispe  ",
    Teléfono: "+51 987 654 321",
    Dirección: "Jr. Ucayali 150, Dpto 2",
    Distrito: "Barranco",
    Provincia: "Lima",
    Departamento: "Lima",
    ...overrides,
  };
  for (const [label, value] of Object.entries(values)) {
    if (value) await user.type(screen.getByLabelText(label), value);
  }
};

describe("formulario de dirección (HU-30)", () => {
  it("pide destinatario, teléfono, dirección, distrito, provincia y departamento, y una referencia opcional", () => {
    setup();
    for (const label of [
      "Destinatario",
      "Teléfono",
      "Dirección",
      "Distrito",
      "Provincia",
      "Departamento",
      "Referencia (opcional)",
    ]) {
      expect(screen.getByLabelText(label), label).toBeTruthy();
    }
  });

  it("empieza vacío: la tienda no recuerda direcciones (DP-13)", () => {
    setup();
    for (const input of screen.getAllByRole("textbox"))
      expect((input as HTMLInputElement).value).toBe("");
  });

  it("cada campo lleva el largo máximo de RN-22", () => {
    setup();
    const max = (label: string) => screen.getByLabelText(label).getAttribute("maxlength");
    expect([
      max("Destinatario"),
      max("Teléfono"),
      max("Dirección"),
      max("Distrito"),
      max("Provincia"),
      max("Departamento"),
      max("Referencia (opcional)"),
    ]).toEqual(["100", "20", "200", "60", "60", "60", "200"]);
  });

  it("los campos piden lo que el navegador sabe autocompletar", () => {
    setup();
    expect(screen.getByLabelText("Destinatario").getAttribute("autocomplete")).toBe("name");
    expect(screen.getByLabelText("Teléfono").getAttribute("autocomplete")).toBe("tel");
    expect(screen.getByLabelText("Teléfono").getAttribute("inputmode")).toBe("tel");
    expect(screen.getByLabelText("Dirección").getAttribute("autocomplete")).toBe("address-line1");
  });

  it("completo: entrega la dirección recortada, sin referencia si está vacía", async () => {
    const { onSubmit, user } = setup();
    await fillAll(user);
    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      recipient: "María Quispe",
      phone: "+51 987 654 321",
      line1: "Jr. Ucayali 150, Dpto 2",
      district: "Barranco",
      province: "Lima",
      department: "Lima",
    });
  });

  it("con referencia, la entrega recortada", async () => {
    const { onSubmit, user } = setup();
    await fillAll(user);
    await user.type(screen.getByLabelText("Referencia (opcional)"), "  Casa de rejas verdes ");
    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]?.[0].reference).toBe("Casa de rejas verdes");
  });

  it("vacío: dice qué falta junto a cada campo, pone el foco en el primero y no envía", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: "Pagar" }));
    expect(await screen.findByText("Escribe el nombre de quien recibe.")).toBeTruthy();
    for (const text of [
      "Escribe un teléfono.",
      "Escribe la dirección.",
      "Escribe el distrito.",
      "Escribe la provincia.",
      "Escribe el departamento.",
    ]) {
      expect(screen.getByText(text), text).toBeTruthy();
    }
    expect(onSubmit).not.toHaveBeenCalled();
    const first = screen.getByLabelText("Destinatario");
    expect(first.getAttribute("aria-invalid")).toBe("true");
    expect(first.getAttribute("aria-describedby")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(first));
  });

  it("un teléfono inválido se avisa junto al campo y no se envía", async () => {
    const { onSubmit, user } = setup();
    await fillAll(user, { Teléfono: "abc" });
    await user.click(screen.getByRole("button", { name: "Pagar" }));
    expect(await screen.findByText(/Escribe un teléfono válido/)).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Teléfono")));
  });

  it("el error de un campo desaparece al corregirlo", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await screen.findByText("Escribe el distrito.");
    await user.type(screen.getByLabelText("Distrito"), "Barranco");
    await waitFor(() => expect(screen.queryByText("Escribe el distrito.")).toBeNull());
  });

  it("avisa de cada cambio, tal como se escribe (para guardar el borrador)", async () => {
    const { onChange, user } = setup();
    await user.type(screen.getByLabelText("Distrito"), "  Ba");
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last.district).toBe("  Ba");
  });

  it("parte de los valores que se le dan (el borrador del intento en curso)", () => {
    setup({
      defaultValues: {
        recipient: "Ana",
        phone: "",
        line1: "",
        district: "",
        province: "",
        department: "",
        reference: "",
      },
    });
    expect((screen.getByLabelText("Destinatario") as HTMLInputElement).value).toBe("Ana");
  });

  it("deshabilitado mientras se paga: no se puede editar", () => {
    setup({ disabled: true });
    for (const input of screen.getAllByRole("textbox"))
      expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it("un error del servidor sobre el teléfono sale junto al campo y se enfoca", async () => {
    const { rerender } = setup();
    rerender(
      <>
        <ShippingForm
          onSubmit={() => {}}
          onChange={() => {}}
          serverError={{
            field: "phone",
            message: "Revisa tu dirección de envío, en especial el teléfono.",
          }}
        />
        <button type="submit" form="shipping-form">
          Pagar
        </button>
      </>,
    );
    expect(
      await screen.findByText("Revisa tu dirección de envío, en especial el teléfono."),
    ).toBeTruthy();
    const phone = screen.getByLabelText("Teléfono");
    expect(phone.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(phone));
  });

  it("no tiene violaciones de accesibilidad, vacío y con errores", async () => {
    const { container, user } = setup();
    await expectNoA11yViolations(container);
    await user.click(screen.getByRole("button", { name: "Pagar" }));
    await screen.findByText("Escribe el distrito.");
    await expectNoA11yViolations(container);
  });
});
