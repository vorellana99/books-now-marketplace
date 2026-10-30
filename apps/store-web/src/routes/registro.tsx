import { createFileRoute } from "@tanstack/react-router";
import { redirectIfSignedIn, RegisterPage, registerSearchSchema } from "@/features/auth/index.ts";

// PA-03 · Registrarse. La ruta solo conecta: declara la URL y qué pantalla muestra
export const Route = createFileRoute("/registro")({
  beforeLoad: ({ search }) => redirectIfSignedIn({ search }),
  validateSearch: registerSearchSchema,
  component: RegisterPage,
});
