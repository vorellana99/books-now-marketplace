import { beforeEach, describe, expect, it } from "vite-plus/test";
import { ATTEMPT_KEY, clearAttempt, fingerprint, keyFor } from "@/features/checkout/idempotency.ts";

const USER = "11111111-1111-1111-1111-111111111111";
const lines = [
  { isbn: "9780132350884", quantity: 2 },
  { isbn: "9780321125217", quantity: 1 },
];
const address = {
  recipient: "María Quispe",
  phone: "+51 987 654 321",
  line1: "Jr. Ucayali 150",
  district: "Barranco",
  province: "Lima",
  department: "Lima",
  reference: "Casa verde",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

beforeEach(() => sessionStorage.clear());

describe("fingerprint: la huella del intento", () => {
  it("es la misma para el mismo carrito y la misma dirección", () => {
    expect(fingerprint(lines, address)).toBe(fingerprint(lines, address));
  });

  it("no depende del orden de las líneas", () => {
    expect(fingerprint([...lines].reverse(), address)).toBe(fingerprint(lines, address));
  });

  it("el ISBN con o sin guiones es el mismo libro (como en el backend)", () => {
    const hyphenated = [{ isbn: "978-0-13-235088-4", quantity: 2 }, lines[1]!];
    expect(fingerprint(hyphenated, address)).toBe(fingerprint(lines, address));
  });

  it("los espacios sobrantes de la dirección no cambian la huella (el backend los recorta)", () => {
    const spaced = { ...address, recipient: "  María Quispe ", line1: "Jr. Ucayali 150  " };
    expect(fingerprint(lines, spaced)).toBe(fingerprint(lines, address));
  });

  it("una referencia vacía y una ausente son lo mismo", () => {
    const { reference: _omit, ...without } = address;
    expect(fingerprint(lines, { ...address, reference: "" })).toBe(fingerprint(lines, without));
    expect(fingerprint(lines, { ...address, reference: "   " })).toBe(fingerprint(lines, without));
  });

  it("cambia si cambia una cantidad", () => {
    expect(fingerprint([{ ...lines[0]!, quantity: 3 }, lines[1]!], address)).not.toBe(
      fingerprint(lines, address),
    );
  });

  it("cambia si cambia un libro", () => {
    expect(fingerprint([lines[0]!], address)).not.toBe(fingerprint(lines, address));
  });

  it.each([
    "recipient",
    "phone",
    "line1",
    "district",
    "province",
    "department",
    "reference",
  ] as const)(
    "cambia si cambia %s de la dirección: otra dirección con la misma clave es otro carrito",
    (field) => {
      expect(fingerprint(lines, { ...address, [field]: "otro valor" })).not.toBe(
        fingerprint(lines, address),
      );
    },
  );
});

describe("keyFor: la clave de idempotencia", () => {
  it("la primera vez genera un UUID y lo guarda en sessionStorage con su huella", () => {
    const key = keyFor(USER, fingerprint(lines, address));
    expect(key).toMatch(UUID);
    const saved = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) ?? "{}");
    expect(saved).toMatchObject({ key, fingerprint: fingerprint(lines, address), userId: USER });
  });

  it("con la misma huella devuelve la MISMA clave (reintento seguro)", () => {
    const first = keyFor(USER, fingerprint(lines, address));
    expect(keyFor(USER, fingerprint(lines, address))).toBe(first);
  });

  it("con otra huella genera una clave NUEVA", () => {
    const first = keyFor(USER, fingerprint(lines, address));
    const second = keyFor(USER, fingerprint(lines, { ...address, line1: "Otra calle" }));
    expect(second).not.toBe(first);
    expect(second).toMatch(UUID);
  });

  it("forceNew genera una clave nueva aunque la huella no cambie (PREVIOUS_ATTEMPT_FAILED, IDEMPOTENCY_KEY_REUSED)", () => {
    const first = keyFor(USER, fingerprint(lines, address));
    const second = keyFor(USER, fingerprint(lines, address), { forceNew: true });
    expect(second).not.toBe(first);
    // y desde entonces esa es la vigente
    expect(keyFor(USER, fingerprint(lines, address))).toBe(second);
  });

  it("es de cada cuenta: otra persona del mismo equipo no reutiliza la clave", () => {
    const first = keyFor(USER, fingerprint(lines, address));
    expect(keyFor("22222222-2222-2222-2222-222222222222", fingerprint(lines, address))).not.toBe(
      first,
    );
  });

  it("clearAttempt la borra (se llama al recibir el 201)", () => {
    const first = keyFor(USER, fingerprint(lines, address));
    clearAttempt();
    expect(sessionStorage.getItem(ATTEMPT_KEY)).toBeNull();
    expect(keyFor(USER, fingerprint(lines, address))).not.toBe(first);
  });

  it("un valor guardado que no es de fiar se ignora y se genera una clave nueva", () => {
    for (const bad of [
      "{no es json",
      JSON.stringify({ key: 42 }),
      JSON.stringify(["x"]),
      JSON.stringify({ key: "no-es-uuid", fingerprint: "x", userId: USER }),
    ]) {
      sessionStorage.setItem(ATTEMPT_KEY, bad);
      expect(keyFor(USER, "huella")).toMatch(UUID);
    }
  });

  it("vive en sessionStorage, no en localStorage", () => {
    keyFor(USER, fingerprint(lines, address));
    expect(localStorage.getItem(ATTEMPT_KEY)).toBeNull();
  });
});
