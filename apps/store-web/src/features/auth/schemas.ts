import { z } from "zod";

// Lo que se valida antes de enviar es solo lo que ahorra un viaje: que no esté vacío y que parezca un correo. La decisión
// final siempre es del servidor. La contraseña no se recorta: los espacios forman parte de ella
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Escribe tu correo.").pipe(z.email("Escribe un correo válido.")),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export type LoginValues = z.infer<typeof loginSchema>;

// Registro: la contraseña de 10 a 128 caracteres (RN-31). El servidor decide el resto (una contraseña común, o igual al
// correo, es `WEAK_PASSWORD`); aquí solo se avisa lo que se puede saber sin enviar
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const registerSchema = z.object({
  email: z.string().trim().min(1, "Escribe tu correo.").pipe(z.email("Escribe un correo válido.")),
  password: z
    .string()
    .min(1, `Elige una contraseña de al menos ${PASSWORD_MIN} caracteres.`)
    .min(PASSWORD_MIN, `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`)
    .max(PASSWORD_MAX, `La contraseña puede tener hasta ${PASSWORD_MAX} caracteres.`),
});

export type RegisterValues = z.infer<typeof registerSchema>;
