import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useSessionWatcher } from "@/features/auth/index.ts";
import { CartToaster } from "@/features/cart/index.ts";
import { AppShell } from "@/app/app-shell.tsx";
import { ErrorPage } from "@/app/error-page.tsx";
import { NotFoundPage } from "@/app/not-found-page.tsx";

function Root() {
  // Si la sesión se pierde en otra pestaña, esta se entera (vacía su caché y revisa la guardia de la ruta actual)
  useSessionWatcher();
  return (
    <AppShell>
      <Outlet />
      <CartToaster />
    </AppShell>
  );
}

// Las rutas solo conectan: declaran la ruta, su acceso y qué pantalla muestran (regla 3 de la guía)
export const Route = createRootRoute({
  component: Root,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
});
