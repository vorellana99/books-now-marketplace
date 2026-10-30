import { DropdownMenu as Primitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn.ts";

// Menú desplegable (el menú de la cuenta en escritorio). Radix da lo difícil: se abre con Enter o Espacio, se recorre con
// las flechas, se cierra con `Esc` y devuelve el foco al botón que lo abrió
export const DropdownMenu = Primitive.Root;
export const DropdownMenuTrigger = Primitive.Trigger;

export function DropdownMenuContent({
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        align="end"
        sideOffset={6}
        className={cn(
          "z-50 min-w-56 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Primitive.Label>) {
  return (
    <Primitive.Label
      className={cn("px-3 py-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "flex min-h-11 cursor-pointer items-center rounded-md px-3 font-medium outline-none data-[highlighted]:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Primitive.Separator>) {
  return <Primitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />;
}
