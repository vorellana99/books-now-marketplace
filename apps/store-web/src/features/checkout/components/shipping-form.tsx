import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { TextField } from "@/shared/ui/text-field.tsx";
import { EMPTY_ADDRESS } from "../address.store.ts";
import { LIMITS, shippingSchema, type ShippingAddress, type ShippingInput } from "../schemas.ts";

type Field = keyof ShippingInput;

type Props = {
  defaultValues?: Required<ShippingInput>;
  onSubmit: (address: ShippingAddress) => void;
  // Cada cambio, tal como se escribe: la pantalla guarda el borrador del intento en curso
  onChange: (values: ShippingInput) => void;
  disabled?: boolean;
  // Un error del servidor sobre un campo (por ejemplo `INVALID_SHIPPING_ADDRESS` sobre el teléfono)
  serverError?: { field: Field; message: string } | undefined;
};

// El formulario de envío (HU-30). El botón de pagar está fuera, en el resumen: se asocia con `form="shipping-form"`. La
// validación de aquí solo ahorra un viaje; la decisión final es del servidor
export function ShippingForm({
  defaultValues = EMPTY_ADDRESS,
  onSubmit,
  onChange,
  disabled = false,
  serverError,
}: Props) {
  const form = useForm<ShippingInput, unknown, ShippingAddress>({
    resolver: zodResolver(shippingSchema),
    defaultValues,
  });
  const { errors } = form.formState;

  useEffect(() => {
    const subscription = form.watch((values) => onChange(values as ShippingInput));
    return () => subscription.unsubscribe();
  }, [form, onChange]);

  useEffect(() => {
    if (!serverError) return;
    form.setError(serverError.field, { type: "server", message: serverError.message });
    form.setFocus(serverError.field);
  }, [serverError, form]);

  const field = (name: Field, label: string, extra: Record<string, string> = {}) => (
    <TextField
      label={label}
      maxLength={LIMITS[name]}
      disabled={disabled}
      error={errors[name]?.message}
      {...extra}
      {...form.register(name)}
    />
  );

  return (
    <form
      id="shipping-form"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      {field("recipient", "Destinatario", { autoComplete: "name" })}
      {field("phone", "Teléfono", { autoComplete: "tel", inputMode: "tel", type: "tel" })}
      {field("line1", "Dirección", { autoComplete: "address-line1" })}
      <div className="grid gap-4 sm:grid-cols-3">
        {field("district", "Distrito", { autoComplete: "address-level3" })}
        {field("province", "Provincia", { autoComplete: "address-level2" })}
        {field("department", "Departamento", { autoComplete: "address-level1" })}
      </div>
      {field("reference", "Referencia (opcional)")}
    </form>
  );
}
