import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api, configureApi, rawApi, unwrap } from "@/shared/api/client.ts";
import { ApiError, NetworkError } from "@/shared/api/errors.ts";
import { server } from "../support/server.ts";

const URL = (path: string) => `${globalThis.location.origin}/api${path}`;

const bookBody = {
  isbn: "9780132350884",
  title: "Clean Code",
  author: "Robert C. Martin",
  price: { amount: "90.00", currency: "PEN" },
};

// Cada prueba deja el cliente sin sesión, como arranca la app
afterEach(() => {
  configureApi({ getAccessToken: () => null, refreshSession: () => Promise.resolve(false) });
});

describe("cliente de API", () => {
  it("llama por ruta y método, y devuelve los datos", async () => {
    server.use(http.get(URL("/books/:isbn"), () => HttpResponse.json(bookBody)));
    const book = await unwrap(
      api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } }),
    );
    expect(book.title).toBe("Clean Code");
  });

  it("envía un X-Request-Id propio en cada petición", async () => {
    let received: string | null = null;
    server.use(
      http.get(URL("/books/:isbn"), ({ request }) => {
        received = request.headers.get("X-Request-Id");
        return HttpResponse.json(bookBody);
      }),
    );
    await api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } });
    expect(received).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("pone el token de acceso si hay sesión", async () => {
    configureApi({ getAccessToken: () => "token-1", refreshSession: () => Promise.resolve(false) });
    let authorization: string | null = null;
    server.use(
      http.get(URL("/books/:isbn"), ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json(bookBody);
      }),
    );
    await api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } });
    expect(authorization).toBe("Bearer token-1");
  });

  it("no manda Authorization si no hay sesión", async () => {
    let authorization: string | null = "valor";
    server.use(
      http.get(URL("/books/:isbn"), ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json(bookBody);
      }),
    );
    await api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } });
    expect(authorization).toBeNull();
  });
});

describe("renovación tras un 401", () => {
  it("renueva una vez y repite la petición con el token nuevo", async () => {
    let token = "viejo";
    const refreshSession = vi.fn(() => {
      token = "nuevo";
      return Promise.resolve(true);
    });
    configureApi({ getAccessToken: () => token, refreshSession });

    const seen: (string | null)[] = [];
    server.use(
      http.get(URL("/books/:isbn"), ({ request }) => {
        const authorization = request.headers.get("Authorization");
        seen.push(authorization);
        return authorization === "Bearer nuevo"
          ? HttpResponse.json(bookBody)
          : HttpResponse.json({ statusCode: 401, errorCode: "UNAUTHENTICATED" }, { status: 401 });
      }),
    );

    const book = await unwrap(
      api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } }),
    );
    expect(book.title).toBe("Clean Code");
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(seen).toEqual(["Bearer viejo", "Bearer nuevo"]);
  });

  it("repite también una petición con cuerpo (el cuerpo no se pierde)", async () => {
    let token = "viejo";
    configureApi({
      getAccessToken: () => token,
      refreshSession: () => {
        token = "nuevo";
        return Promise.resolve(true);
      },
    });
    const bodies: unknown[] = [];
    server.use(
      http.post(URL("/orders"), async ({ request }) => {
        bodies.push(await request.json());
        return request.headers.get("Authorization") === "Bearer nuevo"
          ? HttpResponse.json(
              { orderId: "o-1", charged: { amount: "90.00", currency: "PEN" } },
              { status: 201 },
            )
          : HttpResponse.json({ statusCode: 401 }, { status: 401 });
      }),
    );

    const result = await api.POST("/orders", {
      params: { header: { "Idempotency-Key": "k-1" } },
      body: {
        customerId: "c-1",
        cardToken: "tok_ok",
        items: [{ isbn: "9780132350884", quantity: 1 }],
        shippingAddress: {
          recipient: "Ana",
          phone: "+51 999 999 999",
          line1: "Jr. Ucayali 150",
          district: "Barranco",
          province: "Lima",
          department: "Lima",
        },
      },
    });
    expect(result.response.status).toBe(201);
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toEqual(bodies[0]);
  });

  it("si la renovación falla, devuelve el 401 original", async () => {
    configureApi({ getAccessToken: () => "viejo", refreshSession: () => Promise.resolve(false) });
    server.use(
      http.get(URL("/books/:isbn"), () =>
        HttpResponse.json({ statusCode: 401, errorCode: "UNAUTHENTICATED" }, { status: 401 }),
      ),
    );
    await expect(
      unwrap(api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } })),
    ).rejects.toMatchObject({ status: 401, errorCode: "UNAUTHENTICATED" });
  });

  it("no intenta renovar cuando el 401 es de /auth/* (credenciales incorrectas)", async () => {
    const refreshSession = vi.fn(() => Promise.resolve(true));
    configureApi({ getAccessToken: () => null, refreshSession });
    server.use(
      http.post(URL("/auth/login"), () =>
        HttpResponse.json({ statusCode: 401, errorCode: "INVALID_CREDENTIALS" }, { status: 401 }),
      ),
    );
    await expect(
      unwrap(api.POST("/auth/login", { body: { email: "ana@example.com", password: "x" } })),
    ).rejects.toMatchObject({ errorCode: "INVALID_CREDENTIALS" });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("rawApi no pone token ni renueva", async () => {
    const refreshSession = vi.fn(() => Promise.resolve(true));
    configureApi({ getAccessToken: () => "token", refreshSession });
    let authorization: string | null = "valor";
    server.use(
      http.get(URL("/books/:isbn"), ({ request }) => {
        authorization = request.headers.get("Authorization");
        return HttpResponse.json({ statusCode: 401 }, { status: 401 });
      }),
    );
    await rawApi.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } });
    expect(authorization).toBeNull();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("unwrap", () => {
  it("lanza un ApiError con el código y el identificador de soporte", async () => {
    server.use(
      http.get(URL("/books/:isbn"), () =>
        HttpResponse.json(
          { statusCode: 404, errorCode: "NOT_FOUND", message: "No existe" },
          { status: 404, headers: { "X-Request-Id": "soporte-9" } },
        ),
      ),
    );
    const error = await unwrap(
      api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } }),
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, errorCode: "NOT_FOUND", requestId: "soporte-9" });
  });

  it("lanza un NetworkError si no hubo respuesta", async () => {
    server.use(http.get(URL("/books/:isbn"), () => HttpResponse.error()));
    await expect(
      unwrap(api.GET("/books/{isbn}", { params: { path: { isbn: "9780132350884" } } })),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});
