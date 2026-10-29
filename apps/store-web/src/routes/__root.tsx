import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/app/app-shell.tsx";
import { ErrorPage } from "@/app/error-page.tsx";
import { NotFoundPage } from "@/app/not-found-page.tsx";

// Las rutas solo conectan: declaran la ruta, su acceso y qué pantalla muestran (regla 3 de la guía)
export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});
