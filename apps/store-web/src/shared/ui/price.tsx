import { cn } from "@/shared/lib/cn.ts";
import type { Money } from "@/shared/api/types.ts";
import { formatMoney } from "@/shared/lib/money.ts";

// Un monto con el formato de la tienda ("S/ 90.00", "90.00 USD"). Recibe el texto de la API, nunca un `number`
export function Price({
  money,
  size = "normal",
  className,
}: {
  money: Money;
  size?: "normal" | "large";
  className?: string;
}) {
  return (
    <span
      className={cn("money font-semibold", size === "large" ? "text-2xl" : "text-base", className)}
    >
      {formatMoney(money)}
    </span>
  );
}
