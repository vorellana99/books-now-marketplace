import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";

// La API simulada de las pruebas. Cada prueba agrega sus handlers con `server.use(...)`;
// `setup.ts` los reinicia después de cada una.
// Los endpoints que aún no existen en el backend (POST /orders/quote, GET /me/orders) llevan el comentario
// `// CONTRATO PROPUESTO: aún no existe en el backend` en su handler.
const handlers: RequestHandler[] = [];

export const server = setupServer(...handlers);
