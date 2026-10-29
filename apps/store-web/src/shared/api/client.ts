import createClient, { type Middleware } from "openapi-fetch";
import { env } from "@/shared/config/env.ts";
import { NetworkError, toApiError } from "./errors.ts";
import type { paths } from "./types.ts";

// La sesión vive en `features/auth` y `shared/` no puede importar de `features/`: la funcionalidad le
// entrega estas dos funciones al arrancar con `configureApi`. Mientras no se configure, no hay sesión
export type SessionHooks = {
  getAccessToken: () => string | null;
  refreshSession: () => Promise<boolean>;
};

let session: SessionHooks = {
  getAccessToken: () => null,
  refreshSession: () => Promise.resolve(false),
};

export function configureApi(hooks: SessionHooks): void {
  session = hooks;
}

// `new Request` exige una URL absoluta, así que `/api` se resuelve contra el origen de la página
const baseUrl = new URL(env.VITE_API_BASE_URL, globalThis.location.origin).href.replace(/\/$/, "");

const isAuthRequest = (url: string) => new URL(url).pathname.includes("/auth/");

// Copia de cada petición, para poder repetirla si el cuerpo ya se consumió al enviarla
const sent = new Map<string, Request>();

const withSession: Middleware = {
  onRequest({ request, id }) {
    const token = session.getAccessToken();
    if (token) request.headers.set("Authorization", `Bearer ${token}`);
    // La API acepta este identificador o genera otro, y lo devuelve: sirve de código de soporte en un error
    request.headers.set("X-Request-Id", crypto.randomUUID());
    sent.set(id, request.clone());
    return request;
  },
  async onResponse({ request, response, id }) {
    const original = sent.get(id);
    sent.delete(id);
    if (response.status !== 401 || isAuthRequest(request.url) || !original) return response;
    // Token vencido: se renueva una vez y se repite la petición original
    if (!(await session.refreshSession())) return response;
    const token = session.getAccessToken();
    if (token) original.headers.set("Authorization", `Bearer ${token}`);
    return globalThis.fetch(original);
  },
  onError({ id }) {
    sent.delete(id);
  },
};

// `openapi-fetch` guarda el `fetch` que recibe al crear el cliente. Se le pasa una función que busca `fetch` en cada
// llamada, para que las pruebas (MSW) puedan reemplazarlo después de crear el cliente
const options = { baseUrl, fetch: (request: Request) => globalThis.fetch(request) };

// Con la sesión puesta: es el que usa casi toda la app
export const api = createClient<paths>(options);
api.use(withSession);

// Sin sesión: para `/auth/*` y para que la renovación del token no se llame a sí misma
export const rawApi = createClient<paths>(options);

type Result<T> = { data?: T; error?: unknown; response: Response };

// Devuelve los datos o lanza un ApiError (la API respondió un error) o un NetworkError (no respondió)
export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await call;
  } catch (cause) {
    throw new NetworkError(cause);
  }
  if (!result.response.ok) throw toApiError(result.response, result.error);
  return result.data as T;
}
