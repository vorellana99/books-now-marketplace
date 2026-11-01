import { describe, expect, it } from "vite-plus/test";
import { shippingSchema } from "@/features/checkout/schemas.ts";

const valid = {
  recipient: "María Quispe",
  phone: "+51 987 654 321",
  line1: "Jr. Ucayali 150, Dpto 2",
  district: "Barranco",
  province: "Lima",
  department: "Lima",
  reference: "",
};
const issues = (value: unknown) => {
  const result = shippingSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("dirección de envío (RN-22)", () => {
  it("acepta una dirección completa", () => {
    expect(shippingSchema.safeParse(valid).success).toBe(true);
  });

  it("recorta los espacios de los extremos sin avisar", () => {
    const result = shippingSchema.parse({
      ...valid,
      recipient: "  María Quispe  ",
      line1: " Jr. Ucayali 150 ",
      reference: "  Casa verde ",
    });
    expect(result.recipient).toBe("María Quispe");
    expect(result.line1).toBe("Jr. Ucayali 150");
    expect(result.reference).toBe("Casa verde");
  });

  it("la referencia es opcional: vacía o de espacios, se omite", () => {
    expect(shippingSchema.parse({ ...valid, reference: "" }).reference).toBeUndefined();
    expect(shippingSchema.parse({ ...valid, reference: "   " }).reference).toBeUndefined();
    expect(shippingSchema.parse({ ...valid, reference: undefined }).reference).toBeUndefined();
  });

  it.each(["recipient", "phone", "line1", "district", "province", "department"] as const)(
    "%s es obligatorio, también si son solo espacios",
    (field) => {
      expect(issues({ ...valid, [field]: "" })).toHaveLength(1);
      expect(issues({ ...valid, [field]: "   " })).toHaveLength(1);
    },
  );

  it.each([
    ["recipient", 100],
    ["phone", 20],
    ["line1", 200],
    ["district", 60],
    ["province", 60],
    ["department", 60],
    ["reference", 200],
  ] as const)("%s admite hasta %i caracteres y rechaza uno más", (field, max) => {
    const value = field === "phone" ? "1".repeat(max) : "a".repeat(max);
    expect(issues({ ...valid, [field]: value })).toEqual([]);
    const tooLong = field === "phone" ? "1".repeat(max + 1) : "a".repeat(max + 1);
    expect(issues({ ...valid, [field]: tooLong })).toHaveLength(1);
  });

  it.each(["+51 987 654 321", "(01) 234-5678", "987654", "+1 (555) 123-4567"])(
    "acepta el teléfono %s",
    (phone) => {
      expect(issues({ ...valid, phone })).toEqual([]);
    },
  );

  it.each(["abc", "12345", "+++ --- ()", "987-654-321x", "teléfono 987654321", "98765"])(
    "rechaza el teléfono %s",
    (phone) => {
      expect(issues({ ...valid, phone })).toHaveLength(1);
    },
  );

  it.each([
    "recipient",
    "phone",
    "line1",
    "district",
    "province",
    "department",
    "reference",
  ] as const)("%s no admite saltos de línea ni caracteres de control", (field) => {
    for (const bad of ["a\nb", "a\rb", "a\tb", "a\u0000b", "a\u007fb"]) {
      const value = field === "phone" ? `987654${bad}` : bad;
      expect(issues({ ...valid, [field]: value }), `${field}: ${JSON.stringify(bad)}`).toHaveLength(
        1,
      );
    }
  });

  it("los mensajes están en español y dicen qué hacer", () => {
    expect(issues({ ...valid, recipient: "" })).toEqual([
      "recipient: Escribe el nombre de quien recibe.",
    ]);
    expect(issues({ ...valid, phone: "" })).toEqual(["phone: Escribe un teléfono."]);
    expect(issues({ ...valid, phone: "abc" })[0]).toContain("Escribe un teléfono válido");
    expect(issues({ ...valid, line1: "" })).toEqual(["line1: Escribe la dirección."]);
    expect(issues({ ...valid, district: "" })).toEqual(["district: Escribe el distrito."]);
    expect(issues({ ...valid, province: "" })).toEqual(["province: Escribe la provincia."]);
    expect(issues({ ...valid, department: "" })).toEqual(["department: Escribe el departamento."]);
    expect(issues({ ...valid, line1: "a\nb" })[0]).toContain("saltos de línea");
  });
});
