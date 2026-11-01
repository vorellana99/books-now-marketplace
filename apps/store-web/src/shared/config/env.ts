import { z } from "@/shared/lib/zod.ts";

// Variables VITE_*: son públicas (van dentro del código que baja el navegador). Nunca se guardan secretos aquí.
// Se validan una sola vez, al cargar la app: si alguna es inválida, no arranca y dice cuál.
const schema = z.object({
  VITE_API_BASE_URL: z.string().min(1).default("/api"),
});

export const env = schema.parse(import.meta.env);
