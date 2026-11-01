import { beforeEach, describe, expect, it } from "vite-plus/test";
import { CART_KEY, createCartStore, MAX_PER_BOOK } from "@/features/cart/cart.store.ts";

const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";

const clean = {
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  unitPrice: { amount: "90.00", currency: "PEN" as const },
};
const ddd = {
  isbn: "9780321125217",
  title: "Domain-Driven Design",
  author: "Eric Evans",
  unitPrice: { amount: "120.00", currency: "PEN" as const },
};
const refactoring = {
  isbn: "9780134757599",
  title: "Refactoring",
  author: "Martin Fowler",
  unitPrice: { amount: "22.50", currency: "USD" as const },
};

let storage: Storage;
beforeEach(() => {
  storage = localStorage;
});
const fresh = () => createCartStore(storage);
const linesOf = (store: ReturnType<typeof fresh>, user = USER_A) => store.getState().linesOf(user);

describe("agregar", () => {
  it("un libro nuevo entra con cantidad 1", () => {
    const store = fresh();
    expect(store.getState().add(USER_A, clean)).toBe("ok");
    expect(linesOf(store)).toEqual([{ ...clean, quantity: 1 }]);
  });

  it("agregarlo otra vez suma 1, sin duplicar la línea", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_A, clean);
    expect(linesOf(store)).toHaveLength(1);
    expect(linesOf(store)[0]?.quantity).toBe(2);
  });

  it("las líneas conservan el orden en que se agregaron", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_A, ddd);
    store.getState().add(USER_A, clean);
    expect(linesOf(store).map((l) => l.isbn)).toEqual([clean.isbn, ddd.isbn]);
  });

  it("máximo 10 unidades por libro (RN-10): la 11ª no entra", () => {
    const store = fresh();
    for (let n = 0; n < MAX_PER_BOOK; n += 1)
      expect(store.getState().add(USER_A, clean)).toBe("ok");
    expect(store.getState().add(USER_A, clean)).toBe("max");
    expect(linesOf(store)[0]?.quantity).toBe(10);
  });

  it("el tope es por libro: otro libro sí entra", () => {
    const store = fresh();
    for (let n = 0; n < MAX_PER_BOOK; n += 1) store.getState().add(USER_A, clean);
    expect(store.getState().add(USER_A, ddd)).toBe("ok");
  });

  it("una sola moneda por carrito (RN-05): un libro en la otra no entra y no se convierte", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    expect(store.getState().add(USER_A, refactoring)).toBe("currency");
    expect(linesOf(store).map((l) => l.isbn)).toEqual([clean.isbn]);
  });

  it("con el carrito vacío cualquier moneda entra", () => {
    const store = fresh();
    expect(store.getState().add(USER_A, refactoring)).toBe("ok");
    expect(store.getState().currencyOf(USER_A)).toBe("USD");
  });

  it("el monto sigue siendo texto: nunca pasa por number", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    expect(typeof linesOf(store)[0]?.unitPrice.amount).toBe("string");
    expect(linesOf(store)[0]?.unitPrice.amount).toBe("90.00");
  });
});

describe("cambiar la cantidad", () => {
  it.each([1, 5, 10])("acepta %i", (quantity) => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().setQuantity(USER_A, clean.isbn, quantity);
    expect(linesOf(store)[0]?.quantity).toBe(quantity);
  });

  it.each([0, -1, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("ignora %s", (quantity) => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().setQuantity(USER_A, clean.isbn, 3);
    store.getState().setQuantity(USER_A, clean.isbn, quantity);
    expect(linesOf(store)[0]?.quantity).toBe(3);
  });

  it("un libro que no está no se crea", () => {
    const store = fresh();
    store.getState().setQuantity(USER_A, clean.isbn, 2);
    expect(linesOf(store)).toEqual([]);
  });
});

describe("quitar y deshacer", () => {
  it("quitar devuelve la línea y su posición, y la saca del carrito", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_A, ddd);
    const removed = store.getState().remove(USER_A, clean.isbn);
    expect(removed).toEqual({ line: { ...clean, quantity: 1 }, index: 0 });
    expect(linesOf(store).map((l) => l.isbn)).toEqual([ddd.isbn]);
  });

  it("quitar un libro que no está no hace nada", () => {
    const store = fresh();
    expect(store.getState().remove(USER_A, clean.isbn)).toBeUndefined();
  });

  it("deshacer lo deja donde estaba, con su cantidad", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().setQuantity(USER_A, clean.isbn, 4);
    store.getState().add(USER_A, ddd);
    const removed = store.getState().remove(USER_A, clean.isbn);
    store.getState().restore(USER_A, removed!.line, removed!.index);
    expect(linesOf(store).map((l) => [l.isbn, l.quantity])).toEqual([
      [clean.isbn, 4],
      [ddd.isbn, 1],
    ]);
  });

  it("deshacer no duplica un libro que se volvió a agregar mientras tanto", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    const removed = store.getState().remove(USER_A, clean.isbn);
    store.getState().add(USER_A, clean);
    store.getState().restore(USER_A, removed!.line, removed!.index);
    expect(linesOf(store)).toHaveLength(1);
    expect(linesOf(store)[0]?.quantity).toBe(1);
  });

  it("vaciar solo vacía el carrito de ese usuario", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_B, ddd);
    store.getState().clear(USER_A);
    expect(linesOf(store, USER_A)).toEqual([]);
    expect(linesOf(store, USER_B)).toHaveLength(1);
  });
});

describe("un carrito por usuario", () => {
  it("no se mezclan entre cuentas del mismo equipo", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_B, ddd);
    store.getState().add(USER_B, ddd);
    expect(linesOf(store, USER_A).map((l) => l.isbn)).toEqual([clean.isbn]);
    expect(linesOf(store, USER_B)[0]?.quantity).toBe(2);
  });

  it("la moneda y los topes son de cada carrito", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    expect(store.getState().add(USER_B, refactoring)).toBe("ok");
  });

  it("un usuario sin carrito tiene uno vacío", () => {
    const store = fresh();
    expect(linesOf(store, "nadie")).toEqual([]);
    expect(store.getState().count("nadie")).toBe(0);
  });
});

describe("totales de unidades", () => {
  it("count suma las unidades de todas las líneas", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_A, clean);
    store.getState().add(USER_A, ddd);
    expect(store.getState().count(USER_A)).toBe(3);
  });
});

describe("actualizar el precio de una línea", () => {
  it("cambia el precio unitario y deja la cantidad", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().setQuantity(USER_A, clean.isbn, 3);
    store
      .getState()
      .updateBook(USER_A, { ...clean, unitPrice: { amount: "99.00", currency: "PEN" } });
    expect(linesOf(store)[0]).toMatchObject({ quantity: 3, unitPrice: { amount: "99.00" } });
  });

  it("también actualiza el título y el autor", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().updateBook(USER_A, { ...clean, title: "Clean Code (2.ª ed.)" });
    expect(linesOf(store)[0]?.title).toBe("Clean Code (2.ª ed.)");
  });

  it("un libro que no está no se agrega", () => {
    const store = fresh();
    store.getState().updateBook(USER_A, clean);
    expect(linesOf(store)).toEqual([]);
  });
});

describe("persistencia", () => {
  it("sobrevive a recargar: otra instancia con el mismo almacenamiento ve el carrito", () => {
    const first = fresh();
    first.getState().add(USER_A, clean);
    first.getState().add(USER_A, clean);

    const afterReload = fresh();

    expect(linesOf(afterReload)).toEqual([{ ...clean, quantity: 2 }]);
  });

  it("se guarda en localStorage bajo libroya.cart, un mapa por usuario", () => {
    const store = fresh();
    store.getState().add(USER_A, clean);
    store.getState().add(USER_B, ddd);
    const saved = JSON.parse(storage.getItem(CART_KEY) ?? "{}") as {
      state: { byUser: Record<string, unknown[]> };
    };
    expect(Object.keys(saved.state.byUser).sort()).toEqual([USER_A, USER_B].sort());
  });

  it("un almacenamiento con JSON roto se ignora: carrito vacío, sin romper", () => {
    storage.setItem(CART_KEY, "{esto no es json");
    expect(linesOf(fresh())).toEqual([]);
  });

  it("un almacenamiento con otra forma se ignora", () => {
    storage.setItem(CART_KEY, JSON.stringify({ state: { byUser: "no" }, version: 1 }));
    expect(linesOf(fresh())).toEqual([]);
  });

  it("una línea manipulada (cantidad 99, precio como número) se descarta; las válidas se conservan", () => {
    storage.setItem(
      CART_KEY,
      JSON.stringify({
        state: {
          byUser: {
            [USER_A]: [
              { ...clean, quantity: 99 },
              { ...ddd, unitPrice: { amount: 120, currency: "PEN" }, quantity: 1 },
              { ...clean, isbn: "9780132350884", quantity: 2 },
            ],
          },
        },
        version: 1,
      }),
    );
    expect(linesOf(fresh())).toEqual([{ ...clean, quantity: 2 }]);
  });

  it("un carrito con dos monedas (manipulado) queda vacío: una sola moneda por carrito", () => {
    storage.setItem(
      CART_KEY,
      JSON.stringify({
        state: {
          byUser: {
            [USER_A]: [
              { ...clean, quantity: 1 },
              { ...refactoring, quantity: 1 },
            ],
          },
        },
        version: 1,
      }),
    );
    expect(linesOf(fresh())).toEqual([]);
  });

  it("cada usuario se valida por separado: el de uno roto no daña al otro", () => {
    storage.setItem(
      CART_KEY,
      JSON.stringify({
        state: { byUser: { [USER_A]: "roto", [USER_B]: [{ ...ddd, quantity: 3 }] } },
        version: 1,
      }),
    );
    const store = fresh();
    expect(linesOf(store, USER_A)).toEqual([]);
    expect(linesOf(store, USER_B)).toEqual([{ ...ddd, quantity: 3 }]);
  });
});

describe("varias pestañas", () => {
  it("un cambio guardado por otra pestaña se ve en esta al llegar el evento storage", async () => {
    const { cartStore, CART_KEY: key } = await import("@/features/cart/cart.store.ts");
    cartStore.getState().clear(USER_A);
    expect(cartStore.getState().linesOf(USER_A)).toEqual([]);

    // Otra pestaña escribió en localStorage
    localStorage.setItem(
      key,
      JSON.stringify({ state: { byUser: { [USER_A]: [{ ...clean, quantity: 3 }] } }, version: 1 }),
    );
    window.dispatchEvent(new StorageEvent("storage", { key }));

    expect(cartStore.getState().linesOf(USER_A)).toEqual([{ ...clean, quantity: 3 }]);
    cartStore.getState().clear(USER_A);
  });

  it("otra clave del almacenamiento no importa", async () => {
    const { cartStore } = await import("@/features/cart/cart.store.ts");
    cartStore.getState().clear(USER_A);
    cartStore.getState().add(USER_A, clean);
    localStorage.setItem("otra", "x");
    window.dispatchEvent(new StorageEvent("storage", { key: "otra" }));
    expect(cartStore.getState().linesOf(USER_A)).toHaveLength(1);
    cartStore.getState().clear(USER_A);
  });
});
