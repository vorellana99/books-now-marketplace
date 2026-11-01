import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { createQueryClient } from "@/app/query-client.ts";
import { configureAuth, resetSession } from "@/features/auth/index.ts";
import { routeTree } from "@/routeTree.gen.ts";

// Monta la app completa (rutas, consultas y layout) en la ruta indicada, con un historial en memoria.
// Las consultas no reintentan: una prueba que falla debe fallar rápido
export async function renderApp(path = "/") {
  // Cada prueba abre la "pestaña" desde cero; la sesión se recupera de `localStorage` si la prueba dejó un token
  resetSession();
  configureAuth();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  // La ruta se resuelve de forma asíncrona: se espera a que el contenido principal exista. La primera prueba de cada archivo
  // carga además los trozos de las rutas (división de código) y con la máquina cargada eso pasa del segundo que espera
  // `findByRole` por defecto: era la causa de fallos «sueltos» de la primera prueba de un archivo
  await screen.findByRole("main", {}, { timeout: 10_000 });
  return { router, queryClient, ...utils };
}
