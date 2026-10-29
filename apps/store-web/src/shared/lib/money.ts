import type { Money } from "@/shared/api/types.ts";

// Los montos son TEXTO con 2 decimales ("90.00"): se formatean manipulando el texto y nunca pasan por `number`,
// que redondea mal (0.1 + 0.2). El frontend no calcula montos (RN-08): solo los muestra
const withThousands = (amount: string): string => {
  const [whole = "0", cents = "00"] = amount.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
};

// 90.00 PEN -> "S/ 90.00"; 90.00 USD -> "90.00 USD"; 1250.00 -> "1,250.00"
export function formatMoney({ amount, currency }: Money): string {
  const text = withThousands(amount);
  return currency === "PEN" ? `S/ ${text}` : `${text} USD`;
}
