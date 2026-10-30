import { setupServer } from "msw/node";
import type { RequestHandler } from "msw";

// La API simulada de las pruebas. Cada prueba agrega sus handlers con `server.use(...)`;
// `setup.ts` los reinicia después de cada una.
// Todas las rutas que usa la tienda existen en el backend (también POST /orders/quote y GET /me/orders): los handlers
// siguen la forma real de `docs/api-contrato.md`. Si alguna ruta faltara, su handler llevaría el comentario
// `// CONTRATO PROPUESTO: aún no existe en el backend`.
const handlers: RequestHandler[] = [];

export const server = setupServer(...handlers);
