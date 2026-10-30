import { Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { TextField } from "@/shared/ui/text-field.tsx";

type PasswordFieldProps = Omit<
  ComponentProps<typeof TextField>,
  "type" | "endAdornment" | "label"
> & {
  label?: string;
};

// El campo de contraseña, con el botón para mostrarla u ocultarla (`aria-pressed` dice en qué estado está)
export function PasswordField({ label = "Contraseña", ...props }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      {...props}
      label={label}
      type={shown ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          aria-label={shown ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={shown}
          onClick={() => setShown((value) => !value)}
          className="grid size-11 place-items-center rounded-md text-muted-foreground hover:bg-accent"
        >
          {shown ? (
            <EyeOff aria-hidden="true" className="size-5" />
          ) : (
            <Eye aria-hidden="true" className="size-5" />
          )}
        </button>
      }
    />
  );
}
