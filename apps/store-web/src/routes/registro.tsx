import { createFileRoute } from "@tanstack/react-router";
import { RegisterPage, registerSearchSchema } from "@/features/auth/index.ts";

// PA-03 · Registrarse. La ruta solo conecta: declara la URL y qué pantalla muestra
export const Route = createFileRoute("/registro")({
  validateSearch: registerSearchSchema,
  component: RegisterPage,
});
