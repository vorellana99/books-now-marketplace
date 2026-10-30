import { createFileRoute } from "@tanstack/react-router";
import { LoginPage, loginSearchSchema } from "@/features/auth/index.ts";

// PA-04 · Iniciar sesión. La ruta solo conecta: declara la URL y qué pantalla muestra
export const Route = createFileRoute("/ingresar")({
  validateSearch: loginSearchSchema,
  component: LoginPage,
});
