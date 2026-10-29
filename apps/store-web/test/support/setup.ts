import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vite-plus/test";
import { server } from "./server.ts";

// jsdom no implementa el desplazamiento de la ventana (lo usa el router al cambiar de ruta)
window.scrollTo = () => {};

// Una petición sin handler es un error de la prueba, no un fallo silencioso
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
});

afterAll(() => server.close());
