import { http, HttpResponse } from "msw";
import { API, apiError } from "./books.ts";

type FakeUser = { id: string; email: string; password: string; role: "BUYER" | "ADMIN" };

// El servidor de cuentas simulado, con las reglas de la API real: el token de refresco sirve una sola vez y reutilizar
// uno usado revoca la sesión entera (RN-34). Sirve para probar la sesión, los formularios y las rutas con sesión
export class FakeAuth {
  users = new Map<string, FakeUser>();
  private counter = 0;
  // refreshToken vigente -> id del usuario
  private live = new Map<string, string>();
  private used = new Set<string>();
  private accessValid = new Set<string>();
  refreshCalls: string[] = [];
  loginCalls = 0;
  logoutCalls: string[] = [];
  reuseDetected = false;

  constructor() {
    this.addUser("ana@example.com", "LibroYa-dev-2026");
  }

  addUser(email: string, password: string, role: "BUYER" | "ADMIN" = "BUYER"): FakeUser {
    const user = { id: crypto.randomUUID(), email, password, role };
    this.users.set(email, user);
    return user;
  }

  // Un par de tokens nuevo para el usuario
  private issue(user: FakeUser) {
    this.counter += 1;
    const accessToken = `access-${this.counter}`;
    const refreshToken = `refresh-${this.counter}`;
    this.accessValid.add(accessToken);
    this.live.set(refreshToken, user.id);
    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: 900,
      refreshToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // Un par para sembrar una sesión ya iniciada (como si se hubiera entrado antes)
  seedSession(email = "ana@example.com") {
    return this.issue(this.users.get(email) as FakeUser);
  }

  isAccessValid = (token: string | null) => token !== null && this.accessValid.has(token);
  // El token de acceso vence: los que existían dejan de servir
  expireAccessTokens() {
    this.accessValid.clear();
  }
  liveRefreshTokens = () => [...this.live.keys()];

  handlers = () => [
    http.post(API("/auth/login"), async ({ request }) => {
      this.loginCalls += 1;
      const body = (await request.json()) as { email?: string; password?: string };
      const user = this.users.get((body.email ?? "").trim().toLowerCase());
      if (!user || user.password !== body.password) return apiError(401, "INVALID_CREDENTIALS");
      return HttpResponse.json(this.issue(user));
    }),
    http.post(API("/auth/register"), async ({ request }) => {
      const body = (await request.json()) as { email?: string; password?: string };
      const email = (body.email ?? "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return apiError(422, "INVALID_EMAIL");
      if ((body.password ?? "").length < 10) return apiError(422, "WEAK_PASSWORD");
      if (this.users.has(email)) return apiError(409, "EMAIL_ALREADY_REGISTERED");
      const user = this.addUser(email, body.password ?? "");
      return HttpResponse.json({ id: user.id, email, role: "BUYER" }, { status: 201 });
    }),
    http.post(API("/auth/refresh"), async ({ request }) => {
      const { refreshToken } = (await request.json()) as { refreshToken: string };
      this.refreshCalls.push(refreshToken);
      const userId = this.live.get(refreshToken);
      if (userId === undefined) {
        if (this.used.has(refreshToken)) {
          // Reutilizar un token usado se toma por un robo: se revoca toda la sesión
          this.reuseDetected = true;
          this.live.clear();
          this.accessValid.clear();
        }
        return apiError(401, "INVALID_REFRESH_TOKEN");
      }
      this.live.delete(refreshToken);
      this.used.add(refreshToken);
      const user = [...this.users.values()].find((u) => u.id === userId) as FakeUser;
      return HttpResponse.json(this.issue(user));
    }),
    http.post(API("/auth/logout"), async ({ request }) => {
      const { refreshToken } = (await request.json()) as { refreshToken: string };
      this.logoutCalls.push(refreshToken);
      this.live.delete(refreshToken);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
