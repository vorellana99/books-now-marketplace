// La API real, para preparar los datos de cada prueba (cuentas, libros, stock, pedidos) sin pasar por la pantalla. Lo que se
// prueba por la pantalla se prueba por la pantalla: esto solo deja el escenario listo
export const API = process.env.E2E_API_URL ?? "http://localhost:3000";
export const PASSWORD = "una contraseña larga y buena";

type Call = { method?: string; token?: string; body?: unknown; key?: string };

// El límite de intentos de `/auth/*` (en memoria, por dirección y por cuenta) responde `429` con `Retry-After`: se espera ese
// tiempo y se repite, para que una tanda larga de pruebas no dependa de haber relajado `RATE_LIMIT_*` en el backend
export async function call(
  path: string,
  options: Call = {},
  attempt = 0,
): Promise<{ status: number; body: unknown }> {
  const { method = "GET", token, body, key } = options;
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 429 && attempt < 3) {
    const seconds = Number(response.headers.get("Retry-After") ?? "5");
    await new Promise((resolve) =>
      setTimeout(resolve, (Number.isFinite(seconds) ? seconds : 5) * 1000),
    );
    return call(path, options, attempt + 1);
  }
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
}

const json = <T>(value: unknown) => value as T;

// Espera a que se cumpla algo que el backend resuelve en segundo plano (el Outbox tarda alrededor de un segundo)
export async function eventually<T>(
  what: string,
  attempt: () => Promise<T | undefined>,
  ms = 15_000,
): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const result = await attempt();
    if (result !== undefined) return result;
    if (Date.now() > until) throw new Error(`No ocurrió a tiempo: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export async function adminToken(): Promise<string> {
  const { body } = await call("/auth/login", {
    method: "POST",
    body: { email: "admin@example.com", password: "LibroYa-dev-2026" },
  });
  return json<{ accessToken: string }>(body).accessToken;
}

export type Buyer = { email: string; password: string; accessToken: string; refreshToken: string };

// Un comprador nuevo, listo para comprar: su cliente en Ventas se crea un momento después de registrarse
export async function createBuyer(): Promise<Buyer> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const registered = await call("/auth/register", {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  if (registered.status !== 201) throw new Error(`registro: ${registered.status}`);
  const { body } = await call("/auth/login", {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  const { accessToken, refreshToken } = json<{ accessToken: string; refreshToken: string }>(body);
  await eventually("el cliente de Ventas", async () => {
    const quote = await call("/orders/quote", {
      method: "POST",
      token: accessToken,
      body: { items: [{ isbn: SEEDED.clean, quantity: 1 }] },
    });
    return quote.status === 200 ? true : undefined;
  });
  return { email, password: PASSWORD, accessToken, refreshToken };
}

export const SEEDED = {
  clean: "9780132350884",
  ddd: "9780321125217",
  refactoring: "9780134757599",
};

export async function addStock(isbn: string, quantity: number): Promise<void> {
  const token = await adminToken();
  await eventually(`el stock de ${isbn}`, async () => {
    const { status } = await call(`/admin/stock/${isbn}/additions`, {
      method: "POST",
      token,
      body: { quantity },
    });
    return status === 201 ? true : undefined;
  });
}

// Un ISBN-13 válido que no existe todavía (el dígito de control es parte de la validación de la API)
function newIsbn(): string {
  const base = `979${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 10)}`.slice(0, 12);
  const sum = Array.from(base).reduce(
    (total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 1 : 3),
    0,
  );
  return `${base}${(10 - (sum % 10)) % 10}`;
}

// Un libro nuevo, sin stock (Inventario crea su registro en cero al recibir el evento)
export async function createBook(title: string, price = "30.00"): Promise<string> {
  const token = await adminToken();
  const isbn = newIsbn();
  const { status } = await call("/admin/books", {
    method: "POST",
    token,
    body: { isbn, title, author: "Autora de Prueba", price: { amount: price, currency: "PEN" } },
  });
  if (status !== 201) throw new Error(`crear libro: ${status}`);
  return isbn;
}

export const address = {
  recipient: "María Quispe",
  phone: "+51 987 654 321",
  line1: "Jr. Ucayali 150, Dpto 2",
  district: "Barranco",
  province: "Lima",
  department: "Lima",
};

// Un pedido ya hecho por la API: devuelve su id
export async function placeOrder(buyer: Buyer, items: { isbn: string; quantity: number }[]) {
  const { status, body } = await call("/orders", {
    method: "POST",
    token: buyer.accessToken,
    key: crypto.randomUUID(),
    body: {
      cardToken: "tok_visa",
      items,
      shippingAddress: { ...address, reference: "Casa de rejas verdes" },
    },
  });
  if (status !== 201) throw new Error(`pedido: ${status} ${JSON.stringify(body)}`);
  return json<{ orderId: string; charged: { amount: string; currency: string } }>(body);
}
