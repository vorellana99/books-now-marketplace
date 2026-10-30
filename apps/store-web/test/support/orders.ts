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

type Charged = { amount: string; currency: "PEN" | "USD" };
export type PlacedRequest = {
  key: string | null;
  authorization: string | null;
  body: {
    cardToken?: string;
    items?: QuoteItem[];
    shippingAddress?: Record<string, string>;
    customerId?: string;
  };
};

// El servidor de pedidos simulado, con la regla de idempotencia de la API real (RN-21): la misma clave devuelve el mismo
// pedido sin crear otro. Sirve para probar el pago sin esperar tres segundos de pasarela
export class FakeOrders {
  requests: PlacedRequest[] = [];
  // pedidos creados, por clave de idempotencia
  created = new Map<string, { orderId: string; charged: Charged }>();
  private queue: ((create: () => Response) => Response)[] = [];

  private readonly prices: Record<string, string>;
  // Si se da, una petición con un token de acceso que no sirve recibe `401` (como la API real)
  private readonly accepts: ((accessToken: string | null) => boolean) | undefined;

  constructor(prices: Record<string, string>, accepts?: (accessToken: string | null) => boolean) {
    this.prices = prices;
    this.accepts = accepts;
  }

  // La próxima petición se atiende pero la respuesta se pierde (red caída): el pedido SÍ se creó
  dropNextResponse() {
    this.queue.push((create) => {
      create();
      return HttpResponse.error();
    });
    return this;
  }

  // Las próximas peticiones responden esto, sin crear nada
  respondNext(...responses: (() => Response)[]) {
    for (const respond of responses) this.queue.push(() => respond());
    return this;
  }

  get orderCount() {
    return this.created.size;
  }

  handlers = () => [
    http.post(API("/orders"), async ({ request }) => {
      const body = (await request.json()) as PlacedRequest["body"];
      const key = request.headers.get("Idempotency-Key");
      const authorization = request.headers.get("Authorization");
      this.requests.push({ key, authorization, body });
      if (this.accepts && !this.accepts(authorization?.replace("Bearer ", "") ?? null)) {
        return HttpResponse.json(
          { statusCode: 401, errorCode: "UNAUTHENTICATED", message: "x" },
          { status: 401 },
        );
      }
      const create = (): Response => {
        const existing = key ? this.created.get(key) : undefined;
        if (existing) return HttpResponse.json(existing, { status: 201 });
        const quote = quoteFor(body.items ?? [], this.prices);
        const order = { orderId: crypto.randomUUID(), charged: quote.total };
        if (key) this.created.set(key, order);
        return HttpResponse.json(order, { status: 201 });
      };
      const next = this.queue.shift();
      return next ? next(create) : create();
    }),
  ];
}
