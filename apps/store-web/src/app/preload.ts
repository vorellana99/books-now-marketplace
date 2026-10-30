import type { router } from "@/router.ts";

// Las pantallas de la compra y de los pedidos se cargan por rutas (cada una es un trozo aparte). Si el trozo se pide recién
// cuando la persona toca «Continuar con la compra», la respuesta a ese toque espera a la red: en un teléfono con 4G lenta pasaba
// de los 200 ms del objetivo de INP. Se piden en un momento libre, después del primer pintado, para que ya estén al tocar
export const PRELOADED_ROUTES = ["/carrito", "/compra", "/pedidos"] as const;

// `requestIdleCallback` no existe en Safari: allí se usa un temporizador
export function whenIdle(callback: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(callback, { timeout: 3000 });
  } else {
    setTimeout(callback, 1500);
  }
}

// Una ruta que no se puede precargar (sin sesión redirige a «Entrar», o falla la red) se ignora: es una optimización, no una
// función; la ruta se cargará igual cuando la persona vaya a ella
export function preloadWhenIdle(
  target: Pick<typeof router, "preloadRoute">,
  idle: (callback: () => void) => void = whenIdle,
): void {
  idle(() => {
    for (const to of PRELOADED_ROUTES) {
      try {
        void Promise.resolve(target.preloadRoute({ to })).catch(() => {});
      } catch {
        // una ruta que falla al instante no impide precargar las demás
      }
    }
  });
}
