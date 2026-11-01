import { z } from "@/shared/lib/zod.ts";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { Money } from "@/shared/api/types.ts";

// RN-10: máximo 10 unidades de cada libro en un pedido
export const MAX_PER_BOOK = 10;
export const CART_KEY = "libroya.cart";

// Una línea guarda el libro «tal como se vio al agregarlo»; al abrir el carrito se vuelve a consultar cada libro para
// detectar un cambio de precio o una desactivación (HU-22). El monto es TEXTO: nunca pasa por `number`
export type CartLine = {
  isbn: string;
  title: string;
  author: string;
  unitPrice: Money;
  quantity: number;
};

export type CartBook = Omit<CartLine, "quantity">;
export type AddResult = "ok" | "max" | "currency";

type CartState = {
  // Un solo mapa con un carrito por usuario: no se mezclan entre cuentas de un mismo equipo y no hay que cambiar de clave
  // al iniciar o cerrar sesión
  byUser: Record<string, CartLine[]>;
  linesOf: (userId: string) => CartLine[];
  currencyOf: (userId: string) => Money["currency"] | undefined;
  count: (userId: string) => number;
  add: (userId: string, book: CartBook) => AddResult;
  setQuantity: (userId: string, isbn: string, quantity: number) => void;
  remove: (userId: string, isbn: string) => { line: CartLine; index: number } | undefined;
  restore: (userId: string, line: CartLine, index: number) => void;
  updateBook: (userId: string, book: CartBook) => void;
  clear: (userId: string) => void;
};

const EMPTY: CartLine[] = [];

const lineSchema = z.object({
  isbn: z.string().min(1),
  title: z.string(),
  author: z.string(),
  unitPrice: z.object({
    amount: z.string().regex(/^\d+\.\d{2}$/),
    currency: z.enum(["PEN", "USD"]),
  }),
  quantity: z.number().int().min(1).max(MAX_PER_BOOK),
});

// Lo que viene de `localStorage` no es de fiar (otra versión, otra pestaña, o alguien que lo editó): cada carrito se valida
// por separado, una línea inválida se descarta y un carrito con dos monedas queda vacío
function parseByUser(value: unknown): Record<string, CartLine[]> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Record<string, CartLine[]> = {};
  for (const [userId, lines] of Object.entries(value)) {
    if (!Array.isArray(lines)) continue;
    const seen = new Set<string>();
    const valid: CartLine[] = [];
    for (const candidate of lines as unknown[]) {
      const parsed = lineSchema.safeParse(candidate);
      if (parsed.success && !seen.has(parsed.data.isbn)) {
        seen.add(parsed.data.isbn);
        valid.push(parsed.data);
      }
    }
    if (new Set(valid.map((line) => line.unitPrice.currency)).size > 1) continue;
    if (valid.length > 0) result[userId] = valid;
  }
  return result;
}

export function createCartStore(storage: Storage = localStorage) {
  return createStore<CartState>()(
    persist(
      (set, get) => {
        const write = (userId: string, lines: CartLine[]) =>
          set((state) => {
            const next = { ...state.byUser };
            if (lines.length === 0) delete next[userId];
            else next[userId] = lines;
            return { byUser: next };
          });

        return {
          byUser: {},
          linesOf: (userId) => get().byUser[userId] ?? EMPTY,
          currencyOf: (userId) => get().byUser[userId]?.[0]?.unitPrice.currency,
          count: (userId) =>
            (get().byUser[userId] ?? EMPTY).reduce((sum, line) => sum + line.quantity, 0),

          add: (userId, book) => {
            const lines = get().linesOf(userId);
            const currency = get().currencyOf(userId);
            // RN-05: un pedido se paga en una sola moneda; la tienda no convierte
            if (currency !== undefined && currency !== book.unitPrice.currency) return "currency";
            const existing = lines.find((line) => line.isbn === book.isbn);
            if (existing) {
              if (existing.quantity >= MAX_PER_BOOK) return "max";
              write(
                userId,
                lines.map((line) =>
                  line === existing ? { ...line, quantity: line.quantity + 1 } : line,
                ),
              );
              return "ok";
            }
            write(userId, [...lines, { ...book, quantity: 1 }]);
            return "ok";
          },

          setQuantity: (userId, isbn, quantity) => {
            if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_PER_BOOK) return;
            const lines = get().linesOf(userId);
            if (!lines.some((line) => line.isbn === isbn)) return;
            write(
              userId,
              lines.map((line) => (line.isbn === isbn ? { ...line, quantity } : line)),
            );
          },

          remove: (userId, isbn) => {
            const lines = get().linesOf(userId);
            const index = lines.findIndex((line) => line.isbn === isbn);
            const line = lines[index];
            if (!line) return undefined;
            write(
              userId,
              lines.filter((_, position) => position !== index),
            );
            return { line, index };
          },

          // Deshacer un «Quitar»: vuelve a su lugar, salvo que ese libro se haya agregado otra vez mientras tanto
          restore: (userId, line, index) => {
            const lines = get().linesOf(userId);
            if (lines.some((existing) => existing.isbn === line.isbn)) return;
            const next = [...lines];
            next.splice(Math.min(index, next.length), 0, line);
            write(userId, next);
          },

          updateBook: (userId, book) => {
            const lines = get().linesOf(userId);
            if (!lines.some((line) => line.isbn === book.isbn)) return;
            write(
              userId,
              lines.map((line) => (line.isbn === book.isbn ? { ...line, ...book } : line)),
            );
          },

          clear: (userId) => write(userId, []),
        };
      },
      {
        name: CART_KEY,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ byUser: state.byUser }),
        merge: (persisted, current) => ({
          ...current,
          byUser: parseByUser((persisted as { byUser?: unknown } | undefined)?.byUser),
        }),
      },
    ),
  );
}

// El carrito de esta pestaña (compartido con las demás por `localStorage`)
export const cartStore = createCartStore();

// Otra pestaña cambió el carrito: se vuelve a leer de `localStorage` (el `storage` solo llega a las demás pestañas)
window.addEventListener("storage", (event) => {
  if (event.key === CART_KEY) void cartStore.persist.rehydrate();
});
