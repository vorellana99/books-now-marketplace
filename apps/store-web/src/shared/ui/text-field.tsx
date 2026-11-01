import { CircleAlert } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/shared/lib/cn.ts";

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  // El error de este campo: va debajo, con icono, y se enlaza con `aria-describedby`
  error?: ReactNode;
  hint?: string | undefined;
  // Un botón dentro del campo (por ejemplo, mostrar la contraseña)
  endAdornment?: ReactNode;
  className?: string;
};

// Un campo de formulario: la etiqueta siempre visible y asociada, nunca solo el `placeholder`; texto de 16 px (en iOS un
// campo menor hace que el navegador amplíe la pantalla); el error y la ayuda, enlazados con `aria-describedby`
export function TextField({
  label,
  error,
  hint,
  endAdornment,
  className,
  ref,
  ...props
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={cn(
            "h-11 w-full rounded-md border bg-card px-3 text-base text-foreground placeholder:text-muted-foreground",
            error ? "border-destructive" : "border-input",
            endAdornment ? "pr-12" : "",
          )}
        />
        {endAdornment ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1">{endAdornment}</div>
        ) : null}
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-danger-text">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
