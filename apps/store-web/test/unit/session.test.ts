import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { createSession } from "@/features/auth/session.ts";
import { api, configureApi, unwrap } from "@/shared/api/client.ts";
import { FakeAuth } from "../support/auth.ts";
import { API, apiError, book } from "../support/books.ts";
import { createLocks } from "../support/locks.ts";
import { server } from "../support/server.ts";

const REFRESH_KEY = "libroya.refresh";

let auth: FakeAuth;
beforeEach(() => {
  auth = new FakeAuth();
  server.use(...auth.handlers());
});
afterEach(() => {
  configureApi({ getAccessToken: () => null, refreshSession: () => Promise.resolve(false) });
});

// Una "pestaña": su propio estado en memoria, con el almacenamiento y los candados que se le den
const tab = (storage: Storage = localStorage, locks = createLocks()) =>
  createSession({ storage, locks });

describe("renovación tras un 401", () => {
  it("renueva una vez y repite la petición original con el token nuevo", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    const session = tab();
    session.start({ ...seeded, accessToken: "vencido" }); // el de acceso ya no sirve
    configureApi({
      getAccessToken: session.getAccessToken,
      refreshSession: session.refreshSession,
    });
    const seen: (string | null)[] = [];
    server.use(
      http.get(API("/books/:isbn"), ({ request }) => {
        const authorization = request.headers.get("Authorization");
        seen.push(authorization);
        return auth.isAccessValid(authorization?.replace("Bearer ", "") ?? null)
          ? HttpResponse.json(book())
          : apiError(401, "UNAUTHENTICATED");
      }),
    );

    const result = await unwrap(
      api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } }),
    );

    expect(result.title).toBe("Clean Code");
    expect(auth.refreshCalls).toEqual([seeded.refreshToken]);
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe("Bearer vencido");
    expect(seen[1]).not.toBe(seen[0]);
  });

  it("varias peticiones simultáneas con 401 hacen una sola renovación", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    const session = tab();
    session.start({ ...seeded, accessToken: "vencido" });
    configureApi({
      getAccessToken: session.getAccessToken,
      refreshSession: session.refreshSession,
    });
    server.use(
      http.get(API("/books/:isbn"), ({ request }) =>
        auth.isAccessValid(request.headers.get("Authorization")?.replace("Bearer ", "") ?? null)
          ? HttpResponse.json(book())
          : apiError(401, "UNAUTHENTICATED"),
      ),
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        unwrap(api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } })),
      ),
    );

    expect(results).toHaveLength(5);
    expect(auth.refreshCalls).toHaveLength(1);
    expect(auth.reuseDetected).toBe(false);
  });
});

describe("dos pestañas a la vez", () => {
  it("se serializan con el candado: la segunda lee el token ya rotado y nunca se reutiliza uno", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    const locks = createLocks(); // el mismo candado para las dos
    const a = tab(localStorage, locks);
    const b = tab(localStorage, locks);

    const [okA, okB] = await Promise.all([a.refreshSession(), b.refreshSession()]);

    expect([okA, okB]).toEqual([true, true]);
    expect(auth.reuseDetected).toBe(false);
    expect(auth.refreshCalls).toHaveLength(2);
    expect(auth.refreshCalls[0]).toBe(seeded.refreshToken);
    // la segunda usó el token que dejó la primera, no el viejo
    expect(auth.refreshCalls[1]).not.toBe(seeded.refreshToken);
    expect(localStorage.getItem(REFRESH_KEY)).toBe(auth.liveRefreshTokens()[0]);
    expect(a.getState().status).toBe("authenticated");
    expect(b.getState().status).toBe("authenticated");
  });

  it("sin el candado, el mismo caso sí se tomaría por un robo (la prueba de que el candado hace falta)", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    // Dos candados distintos = sin candado compartido
    const a = tab(localStorage, createLocks());
    const b = tab(localStorage, createLocks());

    await Promise.all([a.refreshSession(), b.refreshSession()]);

    expect(auth.reuseDetected).toBe(true);
  });
});

describe("refresco inválido", () => {
  it("INVALID_REFRESH_TOKEN limpia la sesión y avisa que terminó", async () => {
    localStorage.setItem(REFRESH_KEY, "no-existe");
    const session = tab();

    const ok = await session.refreshSession();

    expect(ok).toBe(false);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(session.getState()).toMatchObject({
      status: "anonymous",
      notice: "expired",
      user: null,
    });
  });

  it("sin token de refresco no llama a la API y queda sin sesión", async () => {
    const session = tab();

    expect(await session.refreshSession()).toBe(false);

    expect(auth.refreshCalls).toEqual([]);
    expect(session.getState().status).toBe("anonymous");
    expect(session.getState().notice).toBeNull();
  });

  it("si la red falla, no se pierde el token de refresco (todavía puede servir)", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    server.use(http.post(API("/auth/refresh"), () => HttpResponse.error()));
    const session = tab();

    expect(await session.refreshSession()).toBe(false);

    expect(localStorage.getItem(REFRESH_KEY)).toBe(seeded.refreshToken);
    expect(session.getState().notice).toBeNull();
  });

  it("un 5xx tampoco borra el token de refresco", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    server.use(http.post(API("/auth/refresh"), () => apiError(500, "INTERNAL_ERROR")));
    const session = tab();

    expect(await session.refreshSession()).toBe(false);

    expect(localStorage.getItem(REFRESH_KEY)).toBe(seeded.refreshToken);
  });
});

describe("arranque", () => {
  it("con un token de refresco guardado renueva antes de decir que hay sesión", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    const session = tab();
    expect(session.getState().status).toBe("unknown");

    const state = await session.ensureSession();

    expect(state.status).toBe("authenticated");
    expect(state.user?.email).toBe("ana@example.com");
    expect(session.getAccessToken()).toMatch(/^access-/);
    expect(localStorage.getItem(REFRESH_KEY)).not.toBe(seeded.refreshToken);
  });

  it("sin token de refresco queda sin sesión, sin llamar a la API", async () => {
    const session = tab();

    const state = await session.ensureSession();

    expect(state.status).toBe("anonymous");
    expect(auth.refreshCalls).toEqual([]);
  });

  it("con la sesión ya iniciada no renueva otra vez", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    const session = tab();
    await session.ensureSession();
    const calls = auth.refreshCalls.length;

    await session.ensureSession();
    await session.ensureSession();

    expect(auth.refreshCalls).toHaveLength(calls);
  });

  it("varias rutas que esperan el arranque a la vez hacen una sola renovación", async () => {
    const seeded = auth.seedSession();
    localStorage.setItem(REFRESH_KEY, seeded.refreshToken);
    const session = tab();

    await Promise.all([session.ensureSession(), session.ensureSession(), session.ensureSession()]);

    expect(auth.refreshCalls).toHaveLength(1);
  });
});

describe("iniciar y cerrar sesión", () => {
  it("iniciar guarda el token de refresco, deja el de acceso en memoria y el usuario", () => {
    const session = tab();
    const login = auth.seedSession();

    session.start(login);

    expect(localStorage.getItem(REFRESH_KEY)).toBe(login.refreshToken);
    expect(session.getAccessToken()).toBe(login.accessToken);
    expect(session.getState()).toMatchObject({
      status: "authenticated",
      user: { email: "ana@example.com", role: "BUYER" },
    });
    // el de acceso nunca va a localStorage
    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key));
    expect(JSON.stringify(stored)).not.toContain(login.accessToken);
  });

  it("cerrar sesión llama a la API y borra los dos tokens", async () => {
    const session = tab();
    const login = auth.seedSession();
    session.start(login);

    await session.signOut();

    expect(auth.logoutCalls).toEqual([login.refreshToken]);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(session.getAccessToken()).toBeNull();
    expect(session.getState()).toMatchObject({ status: "anonymous", user: null, notice: null });
  });

  it.each([
    ["un 500", () => apiError(500, "INTERNAL_ERROR")],
    ["la red caída", () => HttpResponse.error()],
  ])("cerrar sesión borra los tokens aunque la API falle (%s)", async (_caso, respond) => {
    server.use(http.post(API("/auth/logout"), respond));
    const session = tab();
    session.start(auth.seedSession());

    await session.signOut();

    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(session.getState().status).toBe("anonymous");
  });

  it("cerrar sesión sin sesión no llama a la API", async () => {
    const session = tab();

    await session.signOut();

    expect(auth.logoutCalls).toEqual([]);
  });
});

describe("varias pestañas", () => {
  it("una pestaña que ve desaparecer el token de refresco (otra cerró sesión) queda sin sesión", () => {
    const session = tab();
    session.start(auth.seedSession());

    localStorage.removeItem(REFRESH_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: REFRESH_KEY, newValue: null }));

    expect(session.getState().status).toBe("anonymous");
    expect(session.getAccessToken()).toBeNull();
  });

  it("un cambio del token de refresco (otra renovó) no cierra la sesión de esta pestaña", () => {
    const session = tab();
    session.start(auth.seedSession());

    window.dispatchEvent(new StorageEvent("storage", { key: REFRESH_KEY, newValue: "otro-token" }));

    expect(session.getState().status).toBe("authenticated");
  });

  it("otra clave del almacenamiento no importa", () => {
    const session = tab();
    session.start(auth.seedSession());

    window.dispatchEvent(new StorageEvent("storage", { key: "otra", newValue: null }));

    expect(session.getState().status).toBe("authenticated");
  });
});

describe("reset (solo para pruebas)", () => {
  it("deja la sesión como al abrir la pestaña, sin tocar el almacenamiento", () => {
    const session = tab();
    session.start(auth.seedSession());

    session.reset();

    expect(session.getState()).toEqual({ status: "unknown", user: null, notice: null });
    expect(session.getAccessToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).not.toBeNull();
  });
});
