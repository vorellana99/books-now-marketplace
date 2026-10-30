import { createStore } from "zustand/vanilla";
import { isApiError } from "@/shared/api/errors.ts";
import type { Session as Tokens, User } from "@/shared/api/types.ts";
import { logout as logoutApi, refresh as refreshApi } from "./api.ts";

// Token de refresco en `localStorage` (la sesión sobrevive a cerrar el navegador); token de acceso solo en memoria
// (DP-16): recargar lo pierde y se recupera con el de refresco
export const REFRESH_KEY = "libroya.refresh";
const LOCK_NAME = "libroya-refresh";

export type SessionState = {
  // `unknown` hasta que termina el arranque: las rutas con sesión esperan a que deje de serlo
  status: "unknown" | "anonymous" | "authenticated";
  user: User | null;
  // `expired`: la sesión terminó sola (el token de refresco ya no sirve); se muestra una vez en PA-04
  notice: "expired" | null;
};

type LockManagerLike = {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
};

type Deps = {
  storage?: Storage;
  locks?: LockManagerLike | undefined;
  refresh?: (refreshToken: string) => Promise<Tokens>;
  logout?: (refreshToken: string) => Promise<unknown>;
};

// Una sesión es lo que vive en UNA pestaña. Un token de refresco sirve una sola vez y reutilizarlo cierra la sesión entera
// (RN-34): por eso hay una sola renovación a la vez por pestaña, y un candado (Web Locks) entre pestañas. Quien entra al
// candado vuelve a leer el token de `localStorage`, porque otra pestaña pudo haberlo rotado mientras esperaba
export function createSession(deps: Deps = {}) {
  const storage = deps.storage ?? localStorage;
  const locks = "locks" in deps ? deps.locks : globalThis.navigator?.locks;
  const refreshApiCall = deps.refresh ?? refreshApi;
  const logoutApiCall = deps.logout ?? logoutApi;

  const store = createStore<SessionState>(() => ({ status: "unknown", user: null, notice: null }));
  let accessToken: string | null = null;
  let inFlight: Promise<boolean> | null = null;

  const getAccessToken = () => accessToken;
  const getState = () => store.getState();

  function start(tokens: Tokens) {
    accessToken = tokens.accessToken;
    storage.setItem(REFRESH_KEY, tokens.refreshToken);
    store.setState({ status: "authenticated", user: tokens.user, notice: null });
  }

  function clear(notice: SessionState["notice"] = null, { touchStorage = true } = {}) {
    accessToken = null;
    if (touchStorage) storage.removeItem(REFRESH_KEY);
    store.setState({ status: "anonymous", user: null, notice });
  }

  async function renew(): Promise<boolean> {
    const refreshToken = storage.getItem(REFRESH_KEY);
    if (!refreshToken) {
      if (getState().status === "unknown") clear(null);
      return false;
    }
    try {
      start(await refreshApiCall(refreshToken));
      return true;
    } catch (error) {
      // Un token inválido (400/401) no sirve nunca más: la sesión terminó. Una caída de red, un 5xx o un 429 no dicen nada
      // del token (puede que todavía sirva), así que se conserva
      if (isApiError(error) && (error.status === 400 || error.status === 401)) clear("expired");
      else if (getState().status === "unknown") store.setState({ status: "anonymous" });
      return false;
    }
  }

  function refreshSession(): Promise<boolean> {
    inFlight ??= (locks ? locks.request(LOCK_NAME, renew) : renew()).finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  // Al abrir la app: con un token de refresco guardado se renueva antes de decir si hay sesión
  async function ensureSession(): Promise<SessionState> {
    if (getState().status !== "unknown") return getState();
    if (!storage.getItem(REFRESH_KEY)) {
      clear(null);
      return getState();
    }
    await refreshSession();
    return getState();
  }

  // Cierra sesión: los dos tokens se borran aunque la API falle (HU-04)
  async function signOut(): Promise<void> {
    const refreshToken = storage.getItem(REFRESH_KEY);
    clear(null);
    if (!refreshToken) return;
    try {
      await logoutApiCall(refreshToken);
    } catch {
      // Ya no hay sesión de este lado; si la API no respondió, la sesión del servidor vence sola
    }
  }

  // Otra pestaña cerró sesión (el token de refresco desapareció): esta también queda sin sesión
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === REFRESH_KEY &&
      event.newValue === null &&
      getState().status === "authenticated"
    ) {
      clear(null, { touchStorage: false });
    }
  };
  window.addEventListener("storage", onStorage);

  // Vuelve al estado de recién abierta la pestaña, sin tocar el almacenamiento (lo usan las pruebas entre un caso y otro)
  function reset() {
    accessToken = null;
    inFlight = null;
    store.setState({ status: "unknown", user: null, notice: null });
  }

  return {
    store,
    reset,
    getState,
    getAccessToken,
    start,
    clear,
    refreshSession,
    ensureSession,
    signOut,
    dispose: () => window.removeEventListener("storage", onStorage),
  };
}

export type Session = ReturnType<typeof createSession>;

// La sesión de esta pestaña
export const session = createSession();
