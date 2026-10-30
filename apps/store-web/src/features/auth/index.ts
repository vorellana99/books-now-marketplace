import { useStore } from "zustand";
import { configureApi } from "@/shared/api/client.ts";
import { session, type SessionState } from "./session.ts";

export { AccountMenu, MobileAccount } from "./components/account-menu.tsx";
export { useSessionWatcher } from "./hooks/use-session-watcher.ts";
export { redirectIfSignedIn, requireSession } from "./guards.ts";
export { LoginPage } from "./pages/login-page.tsx";
export { RegisterPage } from "./pages/register-page.tsx";
export { safeReturnTo } from "./return-to.ts";
export { loginSearchSchema, registerSearchSchema } from "./search.ts";

export type { SessionState };

// Al arrancar la app: le entrega al cliente de API las dos funciones de la sesión (`shared/` no puede importar de
// `features/`) y empieza a recuperar la sesión si hay un token de refresco guardado
export function configureAuth(): void {
  configureApi({
    getAccessToken: session.getAccessToken,
    refreshSession: session.refreshSession,
  });
  void session.ensureSession();
}

// Las rutas con sesión esperan a que el arranque termine
export const ensureSession = session.ensureSession;
export const startSession = session.start;
export const signOut = session.signOut;
export const clearSession = session.clear;
export const getSessionState = session.getState;
// Solo para las pruebas: deja la sesión como al abrir la pestaña
export const resetSession = session.reset;

export function useSession(): SessionState {
  return useStore(session.store);
}
