import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn.ts";

// Esqueleto de carga: se dibuja con las mismas dimensiones que el contenido final, para que no haya saltos de diseño
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
