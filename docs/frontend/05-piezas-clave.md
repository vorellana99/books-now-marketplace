# Frontend: piezas clave

> Bocetos de las piezas con más riesgo, para fijar la intención. **No son código listo para copiar**: las APIs de las librerías se validan contra la versión instalada y el lint con tipos de Vite+ es el juez. Respetan las restricciones de [01](01-decisiones-y-stack.md#restricciones-del-typescript-que-ya-hay) (sin `enum`, `import type`, extensiones en los imports).

## 1. Montos (`shared/lib/money.ts`)

Se formatea el **texto**; nunca se pasa por `number`.

```ts
import type { components } from "@/shared/api/schema.d.ts";

type Money = components["schemas"]["OrderMoneyResponse"]; // { amount: "90.00"; currency: "PEN" | "USD" }

// "1250.00" -> "1,250.00" sin tocar los decimales ni convertir a número
const withThousands = (amount: string) => {
  const [whole, cents] = amount.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${cents}`;
};

export function formatMoney({ amount, currency }: Money): string {
  const text = withThousands(amount);
  return currency === "PEN" ? `S/ ${text}` : `${text} USD`;
}
```

## 2. Cliente (`shared/api/client.ts`)

```ts
import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema.d.ts";
import { env } from "@/shared/config/env.ts";
import { getAccessToken, refreshSession } from "@/features/auth/index.ts";

export const api = createClient<paths>({ baseUrl: env.VITE_API_BASE_URL });

const withSession: Middleware = {
  onRequest({ request }) {
    const token = getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    request.headers.set("X-Request-Id", crypto.randomUUID());
    return request;
  },
  async onResponse({ request, response }) {
    // 401 en una ruta que no es de /auth: renueva una vez y repite la petición original
    if (response.status !== 401 || request.url.includes("/auth/")) return response;
    if (!(await refreshSession())) return response;
    return fetch(new Request(request, { headers: authorized(request.headers) }));
  },
};
api.use(withSession);
```

> `shared/` no puede importar de `features/` (regla 2 de [01](01-decisiones-y-stack.md#3-arquitectura)). En el código real, `shared/api` recibe las funciones de la sesión por **inyección** al arrancar (`configureApi({ getAccessToken, refreshSession })`) y no las importa. El boceto las importa solo para que se vea el flujo.

## 3. Sesión con renovación serializada (`features/auth/session.ts`)

Un token de refresco sirve una sola vez; dos renovaciones con el mismo token cierran la sesión (RN-34). Una renovación a la vez por pestaña y **un candado entre pestañas**:

```ts
const REFRESH_KEY = "libroya.refresh";
let accessToken: string | null = null;
let inFlight: Promise<boolean> | null = null;

export const getAccessToken = () => accessToken;

export function refreshSession(): Promise<boolean> {
  inFlight ??= navigator.locks
    .request("libroya-refresh", async () => {
      // Se vuelve a leer: otra pestaña pudo haber rotado el token mientras esperábamos el candado
      const refreshToken = localStorage.getItem(REFRESH_KEY);
      if (!refreshToken) return false;

      const { data, error } = await rawClient.POST("/auth/refresh", { body: { refreshToken } });
      if (error || !data) {
        clearSession(); // INVALID_REFRESH_TOKEN u otro: sin sesión
        return false;
      }
      accessToken = data.accessToken;
      localStorage.setItem(REFRESH_KEY, data.refreshToken);
      return true;
    })
    .finally(() => (inFlight = null));
  return inFlight;
}
```

`rawClient` es el cliente **sin** el middleware de sesión, para que la renovación no se llame a sí misma. Una pestaña que ve cambiar o desaparecer `libroya.refresh` (evento `storage`) actualiza su estado de sesión.

## 4. Guardia de ruta (`routes/carrito.tsx`)

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { ensureSession } from "@/features/auth/index.ts";
import { CartPage } from "@/features/cart/index.ts";

export const Route = createFileRoute("/carrito")({
  beforeLoad: async ({ location }) => {
    const session = await ensureSession(); // espera el arranque y la renovación, si hace falta
    if (!session) throw redirect({ to: "/ingresar", search: { returnTo: location.href } });
  },
  component: CartPage,
});
```

## 5. Carrito persistido por usuario (`features/cart/cart.store.ts`)

```ts
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type Line = { isbn: string; title: string; author: string; unitPrice: Money; quantity: number };
type CartState = {
  byUser: Record<string, Line[]>;
  add: (userId: string, book: Omit<Line, "quantity">) => AddResult; // "ok" | "max" | "currency"
  setQuantity: (userId: string, isbn: string, quantity: number) => void;
  remove: (userId: string, isbn: string) => void;
  clear: (userId: string) => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      byUser: {},
      add: (userId, book) => {
        /* RN-10: máximo 10 por libro; RN-05: una sola moneda */
      },
      // …
    }),
    { name: "libroya.cart", storage: createJSONStorage(() => localStorage) },
  ),
);
```

Un solo almacén con un mapa por usuario evita mezclar carritos entre cuentas de un mismo equipo y no necesita cambiar de clave al iniciar o cerrar sesión. `clear` solo vacía el del usuario que compró.

## 6. Clave de idempotencia (`features/checkout/idempotency.ts`)

```ts
const KEY = "libroya.checkout";

type Attempt = { key: string; fingerprint: string };

// La huella cambia si cambia el carrito o la dirección; el ISBN y la dirección se normalizan como hace el backend
export const fingerprint = (lines: Line[], address: Address): string =>
  JSON.stringify([
    [...lines].map((l) => [l.isbn.replaceAll("-", ""), l.quantity]).sort(),
    Object.entries(trimAll(address)).sort(),
  ]);

export function keyFor(fp: string, { forceNew = false } = {}): string {
  const saved = readAttempt();
  if (saved && saved.fingerprint === fp && !forceNew) return saved.key; // reintento seguro
  const next: Attempt = { key: crypto.randomUUID(), fingerprint: fp };
  sessionStorage.setItem(KEY, JSON.stringify(next));
  return next.key;
}

export const clearAttempt = () => sessionStorage.removeItem(KEY); // al recibir el 201
```

`forceNew` se usa tras `PREVIOUS_ATTEMPT_FAILED` o `IDEMPOTENCY_KEY_REUSED`.

## 7. Mensajes de error (`shared/api/error-messages.ts`)

```ts
export type Outcome = { message: string; charged: "no" | "unknown"; action: Action };

const BY_CODE: Record<string, Outcome> = {
  OUT_OF_STOCK: { message: "No hay suficientes unidades de uno de tus libros. No se te cobró nada.", charged: "no", action: "go-cart" },
  PAYMENT_DECLINED: { message: "Tu tarjeta fue rechazada. No se te cobró nada. Prueba con otra tarjeta.", charged: "no", action: "change-card" },
  // … el resto, tomado de producto 07
};

export const outcomeFor = (code: string | undefined): Outcome => BY_CODE[code ?? ""] ?? GENERIC;
```

Una prueba exige que **cada** `errorCode` de la tabla de [producto 07](../product/07-contenido-y-mensajes.md) tenga entrada aquí ([06-tests](06-tests.md)).
