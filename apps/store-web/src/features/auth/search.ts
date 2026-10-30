import { z } from "zod";

// Parámetros de la URL de `/ingresar`. Un valor inválido se descarta en lugar de romper la pantalla. `returnTo` se valida
// al usarlo (`safeReturnTo`); `aviso` dice por qué se llegó; `correo` es el que dejó escrito el registro
export const loginSearchSchema = z.object({
  returnTo: z.string().optional().catch(undefined),
  aviso: z.enum(["carrito", "creada"]).optional().catch(undefined),
  correo: z.email().optional().catch(undefined),
});

export type LoginSearch = z.infer<typeof loginSearchSchema>;
