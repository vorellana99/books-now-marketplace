import { z } from "zod";

// RN-22: largos máximos de la dirección de envío (los mismos que valida la API)
export const LIMITS = {
  recipient: 100,
  phone: 20,
  line1: 200,
  district: 60,
  province: 60,
  department: 60,
  reference: 200,
} as const;

const hasControlChars = (text: string): boolean => {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

// Texto de una línea: recortado, sin saltos de línea ni caracteres de control, hasta su largo máximo
const line = (max: number, required: string, label: string) =>
  z
    .string()
    .trim()
    .min(1, required)
    .max(max, `${label} puede tener hasta ${max} caracteres.`)
    .refine((text) => !hasControlChars(text), "No uses saltos de línea ni caracteres especiales.");

// Dígitos, espacios, +, - y paréntesis, con al menos 6 dígitos
const PHONE = /^[\d\s+\-()]+$/;
const digits = (text: string) => text.replace(/\D/g, "").length;

export const shippingSchema = z.object({
  recipient: line(LIMITS.recipient, "Escribe el nombre de quien recibe.", "El nombre"),
  phone: z
    .string()
    .trim()
    .min(1, "Escribe un teléfono.")
    .max(LIMITS.phone, `El teléfono puede tener hasta ${LIMITS.phone} caracteres.`)
    .refine((text) => !hasControlChars(text), "No uses saltos de línea ni caracteres especiales.")
    .refine(
      // Vacío y con caracteres de control ya tienen su propio mensaje: no se repiten aquí
      (text) => text === "" || hasControlChars(text) || (PHONE.test(text) && digits(text) >= 6),
      "Escribe un teléfono válido: solo dígitos, espacios, +, - y paréntesis, con al menos 6 dígitos.",
    ),
  line1: line(LIMITS.line1, "Escribe la dirección.", "La dirección"),
  district: line(LIMITS.district, "Escribe el distrito.", "El distrito"),
  province: line(LIMITS.province, "Escribe la provincia.", "La provincia"),
  department: line(LIMITS.department, "Escribe el departamento.", "El departamento"),
  // Opcional: vacía o de espacios se omite
  reference: z
    .string()
    .trim()
    .max(LIMITS.reference, `La referencia puede tener hasta ${LIMITS.reference} caracteres.`)
    .refine((text) => !hasControlChars(text), "No uses saltos de línea ni caracteres especiales.")
    .optional()
    .transform((text) => (text ? text : undefined)),
});

// Lo que escribe la persona (la referencia puede venir vacía) y lo que se envía a la API (recortado, sin referencia vacía)
export type ShippingInput = z.input<typeof shippingSchema>;
export type ShippingAddress = z.output<typeof shippingSchema>;
