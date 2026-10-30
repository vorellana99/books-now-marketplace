import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vite-plus/test";
import { cartStore } from "@/features/cart/cart.store.ts";
import { createLocks } from "./locks.ts";
import { server } from "./server.ts";

// jsdom no implementa el desplazamiento de la ventana (lo usa el router al cambiar de ruta)
window.scrollTo = () => {};

// jsdom no trae Web Locks (`navigator.locks`): la sesión los usa para serializar la renovación entre pestañas
Object.defineProperty(navigator, "locks", { value: createLocks(), configurable: true });

// Una petición sin handler es un error de la prueba, no un fallo silencioso
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  // El carrito de la pestaña vive en memoria además de en `localStorage`: también se reinicia entre pruebas
  cartStore.setState({ byUser: {} });
  localStorage.clear();
  sessionStorage.clear();
});

afterAll(() => server.close());
