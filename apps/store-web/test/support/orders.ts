import { http, HttpResponse } from "msw";
import type { Order, OrderHistoryItem, OrderHistoryPage, Quote } from "@/shared/api/types.ts";
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

// Un pedido como lo devuelve `GET /orders/:id`, con una línea y una dirección de ejemplo
export const orderDetail = (overrides: Partial<Order> = {}): Order => ({
  id: "0b6f2f0e-6f0e-4b1e-9a55-3f1f5a0c1d11",
  status: "PLACED",
  charged: { amount: "100.00", currency: "PEN" },
  lines: [
    {
      isbn: "9780132350884",
      title: "Clean Code",
      unitPrice: { amount: "90.00", currency: "PEN" },
      quantity: 1,
    },
  ],
  shippingAddress: {
    recipient: "María Quispe",
    phone: "+51 987 654 321",
    line1: "Jr. Ucayali 150, Dpto 2",
    district: "Barranco",
    province: "Lima",
    department: "Lima",
    reference: null,
  },
  ...overrides,
});

// Un ítem del historial (`GET /me/orders`): el pedido más su fecha
export const historyItem = (overrides: Partial<OrderHistoryItem> = {}): OrderHistoryItem => ({
  ...orderDetail(),
  createdAt: "2026-10-28T10:00:00.000Z",
  ...overrides,
});

export const historyPage = (
  items: OrderHistoryItem[],
  nextCursor: string | null = null,
): OrderHistoryPage => ({ items, nextCursor });

export const myOrdersHandler = (
  respond: (url: URL) => OrderHistoryPage | Response | Promise<OrderHistoryPage | Response>,
) =>
  http.get(API("/me/orders"), async ({ request }) => {
    const result = await respond(new URL(request.url));
    return result instanceof Response ? result : HttpResponse.json(result);
  });

export const orderDetailHandler = (
  respond: (id: string) => Order | Response | Promise<Order | Response>,
) =>
  http.get(API("/orders/:id"), async ({ params }) => {
    const result = await respond(String(params.id));
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
  // lo que `GET /orders/:id` devuelve de cada pedido creado, por id
  details = new Map<string, Order>();
  // cuántas veces se consultó un pedido
  detailRequests = 0;
  private queue: ((create: () => Response) => Response)[] = [];

  private readonly prices: Record<string, string>;
  private readonly titles: Record<string, string>;
  // Si se da, una petición con un token de acceso que no sirve recibe `401` (como la API real)
  private readonly accepts: ((accessToken: string | null) => boolean) | undefined;

  constructor(
    prices: Record<string, string>,
    accepts?: (accessToken: string | null) => boolean,
    titles: Record<string, string> = {},
  ) {
    this.prices = prices;
    this.accepts = accepts;
    this.titles = titles;
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
        this.details.set(order.orderId, {
          id: order.orderId,
          status: "PLACED",
          charged: quote.total,
          lines: quote.lines.map((line) => ({
            isbn: line.isbn,
            title: this.titles[line.isbn] ?? line.isbn,
            unitPrice: line.unitPrice,
            quantity: line.quantity,
          })),
          shippingAddress: body.shippingAddress
            ? ({ reference: null, ...body.shippingAddress } as Order["shippingAddress"])
            : null,
        });
        return HttpResponse.json(order, { status: 201 });
      };
      const next = this.queue.shift();
      return next ? next(create) : create();
    }),
    http.get(API("/orders/:id"), ({ params }) => {
      this.detailRequests += 1;
      const found = this.details.get(String(params.id));
      return found
        ? HttpResponse.json(found)
        : HttpResponse.json(
            { statusCode: 404, errorCode: "NOT_FOUND", message: "x" },
            { status: 404 },
          );
    }),
  ];
}
