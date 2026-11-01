import { z } from "@/shared/lib/zod.ts";
import { createJSONStorage, persist } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { ShippingInput } from "./schemas.ts";

export const ADDRESS_KEY = "libroya.checkout.address";

export const EMPTY_ADDRESS: Required<ShippingInput> = {
  recipient: "",
  phone: "",
  line1: "",
  district: "",
  province: "",
  department: "",
  reference: "",
};

const draftSchema = z.object({
  recipient: z.string(),
  phone: z.string(),
  line1: z.string(),
  district: z.string(),
  province: z.string(),
  department: z.string(),
  reference: z.string(),
});

type AddressState = {
  // El borrador de la dirección de la compra en curso, de cada cuenta
  byUser: Record<string, Required<ShippingInput>>;
  draftOf: (userId: string) => Required<ShippingInput>;
  setDraft: (userId: string, values: ShippingInput) => void;
  clear: (userId: string) => void;
};

// Lo que viene del almacenamiento no es de fiar: un borrador que no cumple la forma se descarta
function parseDrafts(value: unknown): Record<string, Required<ShippingInput>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const result: Record<string, Required<ShippingInput>> = {};
  for (const [userId, draft] of Object.entries(value)) {
    const parsed = draftSchema.safeParse(draft);
    if (parsed.success) result[userId] = parsed.data;
  }
  return result;
}

// La dirección se escribe en cada compra y la tienda no la recuerda (DP-13): el borrador vive solo en la pestaña
// (`sessionStorage`), para que sobreviva a ir al carrito y volver, y desaparece al cerrarla o al confirmar la compra
export function createAddressStore(storage: Storage = sessionStorage) {
  return createStore<AddressState>()(
    persist(
      (set, get) => ({
        byUser: {},
        draftOf: (userId) => get().byUser[userId] ?? EMPTY_ADDRESS,
        setDraft: (userId, values) =>
          set((state) => ({
            byUser: {
              ...state.byUser,
              [userId]: { ...EMPTY_ADDRESS, ...values } as Required<ShippingInput>,
            },
          })),
        clear: (userId) =>
          set((state) => {
            const next = { ...state.byUser };
            delete next[userId];
            return { byUser: next };
          }),
      }),
      {
        name: ADDRESS_KEY,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: (state) => ({ byUser: state.byUser }),
        merge: (persisted, current) => ({
          ...current,
          byUser: parseDrafts((persisted as { byUser?: unknown } | undefined)?.byUser),
        }),
      },
    ),
  );
}

export const addressStore = createAddressStore();
