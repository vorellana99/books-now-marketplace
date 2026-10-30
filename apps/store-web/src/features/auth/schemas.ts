import { z } from "zod";

// Lo que se valida antes de enviar es solo lo que ahorra un viaje: que no esté vacío y que parezca un correo. La decisión
// final siempre es del servidor. La contraseña no se recorta: los espacios forman parte de ella
export const loginSchema = z.object({
  email: z.string().trim().min(1, "Escribe tu correo.").pipe(z.email("Escribe un correo válido.")),
  password: z.string().min(1, "Escribe tu contraseña."),
});

export type LoginValues = z.infer<typeof loginSchema>;
