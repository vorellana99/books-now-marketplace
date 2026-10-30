import { http, HttpResponse } from "msw";
import type { Quote } from "@/shared/api/types.ts";
import { API } from "./books.ts";

export type QuoteItem = { isbn: string; quantity: number };

const cents = (amount: string): number => Math.round(Number(amount) * 100);
const text = (value: number): string => (value / 100).toFixed(2);

// Lo que el servidor simulado responde a `POST /orders/quote`, con las reglas del backend (envío S/ 10.00, gratis desde
// S/ 150.00; descuento opcional). Es el SERVIDOR quien calcula: la tienda nunca suma montos (RN-08)
export function quoteFor(
  items: QuoteItem[],
  prices: Record<string, string>,
  { discount = "0.00", currency = "PEN" as "PEN" | "USD" } = {},
): Quote {
  const lines = [...items]
    .sort((a, b) => (a.isbn < b.isbn ? -1 : 1))
    .map((item) => {
      const unit = prices[item.isbn] ?? "10.00";
      return {
        isbn: item.isbn,
        quantity: item.quantity,
        unitPrice: { amount: unit, currency },
        subtotal: { amount: text(cents(unit) * item.quantity), currency },
      };
    });
  const subtotal = lines.reduce((sum, line) => sum + cents(line.subtotal.amount), 0);
  const free = subtotal >= (currency === "PEN" ? 15000 : 4000);
  const shipping = free ? 0 : currency === "PEN" ? 1000 : 300;
  return {
    currency,
    lines,
    subtotal: { amount: text(subtotal), currency },
    discount: { amount: discount, currency },
    shipping: { amount: text(shipping), currency },
    total: { amount: text(subtotal - cents(discount) + shipping), currency },
  };
}

export const quoteHandler = (
  respond: (items: QuoteItem[], body: unknown) => Quote | Response | Promise<Quote | Response>,
) =>
  http.post(API("/orders/quote"), async ({ request }) => {
    const body = (await request.json()) as { items: QuoteItem[] };
    const result = await respond(body.items, body);
    return result instanceof Response ? result : HttpResponse.json(result);
  });
