import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn.ts";

const alertVariants = cva("flex gap-3 rounded-md border p-3 text-sm leading-5", {
  variants: {
    variant: {
      info: "border-info-border bg-info-bg text-info",
      warning: "border-warning-border bg-warning-bg text-warning",
      error: "border-danger-border bg-danger-bg text-danger-text",
      success: "border-success-border bg-success-bg text-success",
    },
  },
  defaultVariants: { variant: "info" },
});

type Variant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

const icons: Record<Variant, LucideIcon> = {
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
  success: CircleCheck,
};

// Un error o un aviso que pide atención se anuncia de inmediato a los lectores de pantalla (`alert`);
// lo informativo, sin interrumpir (`status`). Nunca comunica solo con el color: lleva icono y texto
const roles: Record<Variant, "alert" | "status"> = {
  info: "status",
  warning: "alert",
  error: "alert",
  success: "status",
};

type AlertProps = {
  variant?: Variant;
  title?: string;
  children?: ReactNode;
  // Un botón o enlace de acción, debajo del texto
  action?: ReactNode;
  // Sustituye el icono, por ejemplo por un indicador de carga
  icon?: ReactNode;
  // Por defecto el rol sale de la variante; se cambia cuando el aviso necesita otro (y un nombre para distinguirlo)
  role?: "alert" | "status";
  label?: string;
  className?: string;
};

export function Alert({
  variant = "info",
  title,
  children,
  action,
  icon,
  role,
  label,
  className,
}: AlertProps) {
  const Icon = icons[variant];
  return (
    <div
      role={role ?? roles[variant]}
      aria-label={label}
      className={cn(alertVariants({ variant }), className)}
    >
      {icon ?? <Icon aria-hidden="true" className="size-5 shrink-0" />}
      <div className="flex min-w-0 flex-col items-start gap-2">
        {title ? <strong className="font-semibold">{title}</strong> : null}
        {children ? <div>{children}</div> : null}
        {action}
      </div>
    </div>
  );
}
