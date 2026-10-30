import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn.ts";

// Alto mínimo de 44 px (objetivo táctil de docs/product/08). Una sola variante principal por pantalla
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        outline: "border border-input bg-card text-foreground hover:bg-accent",
        ghost: "text-primary hover:bg-accent",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-11 px-4",
        icon: "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    // Con `asChild` el estilo se aplica al hijo (por ejemplo un enlace del router)
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
