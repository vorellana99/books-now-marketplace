import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen.ts";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

// Registra el router para que los enlaces y los parámetros de URL lleven tipos en toda la app
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
