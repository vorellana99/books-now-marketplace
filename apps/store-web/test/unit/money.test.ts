import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { formatMoney } from "@/shared/lib/money.ts";

describe("formatMoney", () => {
  it("da formato a soles y a dólares", () => {
    expect(formatMoney({ amount: "90.00", currency: "PEN" })).toBe("S/ 90.00");
    expect(formatMoney({ amount: "90.00", currency: "USD" })).toBe("90.00 USD");
  });

  it("separa los miles con coma sin tocar los decimales", () => {
    expect(formatMoney({ amount: "1250.00", currency: "PEN" })).toBe("S/ 1,250.00");
    expect(formatMoney({ amount: "1234567.89", currency: "USD" })).toBe("1,234,567.89 USD");
  });

  it("deja intactos los importes que `number` redondea mal", () => {
    expect(formatMoney({ amount: "0.10", currency: "PEN" })).toBe("S/ 0.10");
    expect(formatMoney({ amount: "0.30", currency: "PEN" })).toBe("S/ 0.30");
    // 0.1 + 0.2 === 0.30000000000000004 con `number`: el texto no pasa por ahí
    expect(formatMoney({ amount: "100000000000000000.10", currency: "PEN" })).toBe(
      "S/ 100,000,000,000,000,000.10",
    );
  });

  it("nunca convierte el monto a número (RN-08)", () => {
    const source = readFileSync("src/shared/lib/money.ts", "utf-8");
    expect(source).not.toMatch(/\bNumber\(|parseFloat|parseInt|toFixed/);
  });
});
