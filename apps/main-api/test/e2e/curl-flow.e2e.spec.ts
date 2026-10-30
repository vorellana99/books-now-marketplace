import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { SignJWT } from 'jose';
import { query, resetDatabase } from '../support/database.js';

// El "listo cuando" del corte 7, de punta a punta y de verdad: la aplicación compilada arranca como proceso, con su
// propio puerto, y todo se hace con `curl`, como lo haría una persona siguiendo el README. Al final se busca cualquier
// contraseña, hash o token en la base y en los logs del proceso

const PASSWORD = 'una contraseña larga y buena';
const DEV_PASSWORD = 'LibroYa-dev-2026';
const ORIGIN = 'https://libroya.pe';
const ISBN = '9780134494166';
const ADDRESS = {
  recipient: 'María Quispe',
  phone: '+51 987 654 321',
  line1: 'Jr. Ucayali 150, Dpto 2',
  district: 'Barranco',
  province: 'Lima',
  department: 'Lima',
};

interface Reply {
  status: number;
  headers: Record<string, string>;
  body: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  text: string;
}

interface CurlOptions {
  token?: string;
  headers?: Record<string, string>;
  body?: unknown;
}

interface RunningServer {
  base: string;
  output: () => string;
  stop: () => Promise<void>;
}

const newestSource = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).reduce((newest, entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      return entry.name === 'generated'
        ? newest
        : Math.max(newest, newestSource(path));
    }
    return Math.max(newest, statSync(path).mtimeMs);
  }, 0);

// La compuerta ya compiló; al correr este archivo suelto se compila si lo compilado falta o quedó viejo
function ensureBuilt() {
  const main = 'dist/main.js';
  if (!existsSync(main) || statSync(main).mtimeMs < newestSource('src')) {
    execFileSync('pnpm', ['run', 'build'], { stdio: 'pipe' });
  }
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

// Una petición con curl: `-i` devuelve estado, cabeceras y cuerpo
function curlTo(
  base: string,
  method: string,
  path: string,
  options: CurlOptions = {},
): Reply {
  const args = ['-s', '-i', '--max-time', '20', '-X', method, `${base}${path}`];
  if (options.token) args.push('-H', `Authorization: Bearer ${options.token}`);
  for (const [name, value] of Object.entries(options.headers ?? {})) {
    args.push('-H', `${name}: ${value}`);
  }
  if (options.body !== undefined) {
    args.push(
      '-H',
      'Content-Type: application/json',
      '-d',
      JSON.stringify(options.body),
    );
  }
  const raw = execFileSync('curl', args, { encoding: 'utf8' });
  const split = raw.indexOf('\r\n\r\n');
  const head = raw.slice(0, split).split('\r\n');
  const text = raw.slice(split + 4);
  const headers: Record<string, string> = {};
  for (const line of head.slice(1)) {
    const colon = line.indexOf(':');
    headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  return { status: Number(head[0].split(' ')[1]), headers, body, text };
}

async function waitFor(done: () => Promise<boolean>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await done())) {
    if (Date.now() > deadline) throw new Error('se agotó la espera');
    await new Promise((r) => setTimeout(r, 100));
  }
}

// Arranca la aplicación compilada como un proceso aparte, con su propio puerto y las variables que se indiquen
async function startServer(
  extraEnv: Record<string, string> = {},
): Promise<RunningServer> {
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const output: string[] = [];
  const child: ChildProcess = spawn('node', ['dist/main.js'], {
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'test',
      PAYMENT_PROVIDER: 'fake',
      EMAIL_SIMULATED_DELAY_MS: '0',
      PAYMENT_SIMULATED_DELAY_MS: '0',
      ...extraEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => output.push(String(chunk)));
  child.stderr?.on('data', (chunk) => output.push(String(chunk)));
  await waitFor(async () => {
    try {
      return curlTo(base, 'GET', '/health/live').status === 200;
    } catch {
      return false;
    }
  });
  return {
    base,
    output: () => output.join(''),
    stop: async () => {
      child.kill('SIGTERM');
      await new Promise((resolve) => {
        if (child.exitCode !== null) return resolve(undefined);
        child.once('exit', resolve);
        setTimeout(resolve, 5000);
      });
    },
  };
}

describe('El flujo del corte 7 con curl y la aplicación compilada (e2e)', () => {
  let server: RunningServer;
  const curl = (method: string, path: string, options?: CurlOptions) =>
    curlTo(server.base, method, path, options);
  const login = (email: string, password: string) =>
    curl('POST', '/auth/login', { body: { email, password } });
  const purchase = (
    token: string,
    key: string,
    extra: Record<string, unknown> = {},
  ) =>
    curl('POST', '/orders', {
      token,
      headers: { 'Idempotency-Key': key },
      body: {
        cardToken: 'tok_visa',
        items: [{ isbn: ISBN, quantity: 1 }],
        shippingAddress: ADDRESS,
        ...extra,
      },
    });

  // Lo que se va guardando durante el flujo, para buscarlo al final
  const secrets: string[] = [
    DEV_PASSWORD,
    PASSWORD,
    'otra contraseña distinta',
  ];
  let admin: { token: string; refresh: string };
  let ana: { token: string };
  let nueva: { id: string; token: string; refresh: string };
  let orderId: string;
  const orderKey = randomUUID();

  beforeAll(async () => {
    ensureBuilt();
    await resetDatabase();
    execFileSync('pnpm', ['run', 'db:seed'], {
      env: process.env,
      stdio: 'pipe',
    });
    server = await startServer({ CORS_ORIGINS: ORIGIN });
  }, 120_000);
  afterAll(async () => {
    await server?.stop();
  });

  it('la aplicación responde con cabeceras de seguridad y un X-Request-Id', () => {
    const res = curl('GET', '/health/live');
    expect(res.status).toBe(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('el catálogo es público; todo lo demás pide sesión', () => {
    expect(curl('GET', '/books?q=clean').status).toBe(200);
    for (const [method, path] of [
      ['GET', '/me/orders'],
      ['GET', `/orders/${randomUUID()}`],
      ['POST', '/orders'],
      ['GET', `/admin/orders?customerId=${randomUUID()}`],
      ['POST', '/admin/books'],
    ]) {
      const res = curl(method, path);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(res.body.errorCode).toBe('UNAUTHENTICATED');
      expect(res.headers['www-authenticate']).toBe('Bearer');
    }
  });

  it('un comprador y un administrador del seed inician sesión', () => {
    const adminLogin = login('admin@example.com', DEV_PASSWORD);
    const anaLogin = login('ana@example.com', DEV_PASSWORD);
    expect(adminLogin.status).toBe(200);
    expect(anaLogin.status).toBe(200);
    expect(adminLogin.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 900,
      user: { role: 'ADMIN' },
    });
    expect(adminLogin.headers['cache-control']).toBe('no-store');
    admin = {
      token: adminLogin.body.accessToken,
      refresh: adminLogin.body.refreshToken,
    };
    ana = { token: anaLogin.body.accessToken };
    secrets.push(
      admin.token,
      admin.refresh,
      ana.token,
      anaLogin.body.refreshToken,
    );
  });

  it('la administración: sin token 401, con el de un comprador 403, con el de un administrador funciona', async () => {
    const book = {
      isbn: ISBN,
      title: 'Clean Architecture',
      author: 'Robert C. Martin',
      price: { amount: '55.00', currency: 'PEN' },
    };
    expect(curl('POST', '/admin/books', { body: book }).status).toBe(401);
    const forbidden = curl('POST', '/admin/books', {
      token: ana.token,
      body: book,
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.errorCode).toBe('FORBIDDEN');

    const created = curl('POST', '/admin/books', {
      token: admin.token,
      body: book,
    });
    expect(created.status).toBe(201);
    await waitFor(
      async () =>
        (
          await query('SELECT 1 FROM inventory.stock_items WHERE isbn = $1', [
            ISBN,
          ])
        ).length > 0,
    );
    const stocked = curl('POST', `/admin/stock/${ISBN}/additions`, {
      token: admin.token,
      body: { quantity: 25 },
    });
    expect(stocked.status).toBe(201);
    expect(stocked.body).toEqual({ isbn: ISBN, available: 25, reserved: 0 });
    expect(curl('GET', `/books/${ISBN}`).status).toBe(200);
  });

  it('registrarse: 201 como comprador; un correo repetido 409; una contraseña débil 422; el rol no se elige', () => {
    const email = 'nueva@example.com';
    const registered = curl('POST', '/auth/register', {
      body: { email: ' Nueva@Example.com ', password: PASSWORD },
    });
    expect(registered.status).toBe(201);
    expect(registered.body).toMatchObject({ email, role: 'BUYER' });
    expect(
      curl('POST', '/auth/register', { body: { email, password: PASSWORD } })
        .status,
    ).toBe(409);
    expect(
      curl('POST', '/auth/register', {
        body: { email: 'otra@example.com', password: 'corta' },
      }).body.errorCode,
    ).toBe('WEAK_PASSWORD');
    expect(
      curl('POST', '/auth/register', {
        body: {
          email: 'admin2@example.com',
          password: PASSWORD,
          role: 'ADMIN',
        },
      }).status,
    ).toBe(400);

    const session = login(email, PASSWORD);
    expect(session.status).toBe(200);
    nueva = {
      id: registered.body.id,
      token: session.body.accessToken,
      refresh: session.body.refreshToken,
    };
    secrets.push(nueva.token, nueva.refresh);
  });

  it('el login no revela qué correos existen', () => {
    const wrong = login('nueva@example.com', 'otra contraseña distinta');
    const unknown = login('nadie@example.com', PASSWORD);
    const malformed = login('esto no es un correo', PASSWORD);
    for (const res of [wrong, unknown, malformed]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        statusCode: 401,
        errorCode: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos',
      });
    }
  });

  it('comprar con el token, sin mandar customerId', async () => {
    // Ventas crea al cliente cuando el relay entrega el evento del registro
    await waitFor(
      async () =>
        (await query('SELECT 1 FROM sales.customers WHERE id = $1', [nueva.id]))
          .length > 0,
    );

    const withCustomer = purchase(nueva.token, randomUUID(), {
      customerId: nueva.id,
    });
    expect(withCustomer.status).toBe(400);

    const bought = purchase(nueva.token, orderKey);
    expect(bought.status).toBe(201);
    orderId = bought.body.orderId;
    expect(bought.body.charged).toEqual({ amount: '65.00', currency: 'PEN' });

    const repeated = purchase(nueva.token, orderKey);
    expect(repeated.status).toBe(201);
    expect(repeated.body.orderId).toBe(orderId);
    expect(await query('SELECT 1 FROM sales.orders')).toHaveLength(1);
    const [row] = await query<{ customer_id: string }>(
      'SELECT customer_id FROM sales.orders',
    );
    expect(row.customer_id).toBe(nueva.id);
  });

  it('un administrador no compra', () => {
    expect(purchase(admin.token, randomUUID()).status).toBe(403);
  });

  it('cada comprador ve solo lo suyo; otro recibe 404; el administrador ve todo', () => {
    const own = curl('GET', `/orders/${orderId}`, { token: nueva.token });
    expect(own.status).toBe(200);
    // DP-15: el detalle trae la dirección y el teléfono a su dueño
    expect(own.body.shippingAddress).toMatchObject({
      recipient: ADDRESS.recipient,
      phone: ADDRESS.phone,
      line1: ADDRESS.line1,
    });

    const foreign = curl('GET', `/orders/${orderId}`, { token: ana.token });
    const missing = curl('GET', `/orders/${randomUUID()}`, {
      token: ana.token,
    });
    expect(foreign.status).toBe(404);
    expect(foreign.body.errorCode).toBe('NOT_FOUND');
    expect(foreign.text).not.toContain('Clean Architecture');
    expect(foreign.text).not.toContain(ADDRESS.recipient);
    expect(foreign.text).not.toContain(ADDRESS.phone);
    expect(missing.status).toBe(404);

    const mine = curl('GET', '/me/orders', { token: nueva.token });
    expect(mine.body.items.map((o: { id: string }) => o.id)).toEqual([orderId]);
    expect(curl('GET', '/me/orders', { token: ana.token }).body.items).toEqual(
      [],
    );

    const asAdmin = curl('GET', `/orders/${orderId}`, { token: admin.token });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.body.shippingAddress.recipient).toBe(ADDRESS.recipient);
    const history = curl('GET', `/admin/orders?customerId=${nueva.id}`, {
      token: admin.token,
    });
    expect(history.status).toBe(200);
    expect(history.body.items.map((o: { id: string }) => o.id)).toEqual([
      orderId,
    ]);
    expect(
      curl('GET', `/admin/orders?customerId=${nueva.id}`, {
        token: nueva.token,
      }).status,
    ).toBe(403);
  });

  it('la clave de idempotencia de otro comprador no filtra su pedido', () => {
    const stolen = purchase(ana.token, orderKey);
    expect(stolen.status).toBe(422);
    expect(stolen.body.errorCode).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(stolen.text).not.toContain(orderId);
  });

  it('un token alterado, de otro esquema o vencido da 401', async () => {
    const tampered = `${nueva.token.slice(0, -3)}abc`;
    expect(curl('GET', '/me/orders', { token: tampered }).status).toBe(401);
    expect(
      curl('GET', '/me/orders', {
        headers: { Authorization: 'Basic YW5hOnNlY3JldG8=' },
      }).status,
    ).toBe(401);

    // Firmado con el secreto de verdad pero vencido
    const expired = await new SignJWT({ role: 'BUYER' })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('libroya')
      .setAudience('libroya-api')
      .setSubject(nueva.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(new TextEncoder().encode(process.env.JWT_SECRET));
    const res = curl('GET', '/me/orders', { token: expired });
    expect(res.status).toBe(401);
    expect(res.body.errorCode).toBe('TOKEN_EXPIRED');
  });

  it('el refresco rota los tokens, detecta la reutilización y revoca la sesión entera', () => {
    const first = curl('POST', '/auth/refresh', {
      body: { refreshToken: nueva.refresh },
    });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(nueva.refresh);
    secrets.push(first.body.accessToken, first.body.refreshToken);

    const reused = curl('POST', '/auth/refresh', {
      body: { refreshToken: nueva.refresh },
    });
    expect(reused.status).toBe(401);
    expect(reused.body.errorCode).toBe('INVALID_REFRESH_TOKEN');

    const afterTheft = curl('POST', '/auth/refresh', {
      body: { refreshToken: first.body.refreshToken },
    });
    expect(afterTheft.status).toBe(401);
  });

  it('cerrar la sesión revoca el token de refresco', () => {
    const session = login('nueva@example.com', PASSWORD);
    secrets.push(session.body.accessToken, session.body.refreshToken);
    expect(
      curl('POST', '/auth/logout', {
        body: { refreshToken: session.body.refreshToken },
      }).status,
    ).toBe(204);
    expect(
      curl('POST', '/auth/refresh', {
        body: { refreshToken: session.body.refreshToken },
      }).status,
    ).toBe(401);
  });

  it('CORS: el origen configurado recibe sus cabeceras y cualquier otro no', () => {
    const allowed = curl('OPTIONS', '/orders', {
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'authorization,idempotency-key',
      },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);

    const denied = curl('OPTIONS', '/orders', {
      headers: {
        Origin: 'https://evil.example',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('Swagger documenta la seguridad y la administración sin la variable que ya no existe', () => {
    const doc = curl('GET', '/docs-json');
    expect(doc.status).toBe(200);
    expect(doc.body.components.securitySchemes.bearer.scheme).toBe('bearer');
    expect(Object.keys(doc.body.paths)).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/me/orders',
        '/admin/orders',
        '/admin/books',
      ]),
    );
  });

  it('ninguna contraseña ni token aparece en la base ni en los logs; el hash solo en su columna', async () => {
    // Deja que terminen de escribirse los últimos logs
    await new Promise((r) => setTimeout(r, 500));
    const hashes = (
      await query<{ password_hash: string }>(
        'SELECT password_hash FROM identity.users',
      )
    ).map((u) => u.password_hash);
    expect(hashes.length).toBeGreaterThanOrEqual(4);

    const tables = await query<{ name: string }>(
      `SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS name
       FROM pg_tables WHERE schemaname IN ('sales','catalog','inventory','messaging','identity')`,
    );
    for (const { name } of tables) {
      const rows = (
        await query<{ row: string }>(`SELECT t::text AS row FROM ${name} t`)
      )
        .map((r) => r.row)
        .join('\n');
      for (const secret of secrets) {
        expect(rows, `${name} no debe contener un secreto`).not.toContain(
          secret,
        );
      }
      if (name !== 'identity.users') {
        for (const hash of hashes) {
          expect(rows, `${name} no debe contener un hash`).not.toContain(hash);
        }
      }
    }

    const logs = server.output();
    expect(logs.length).toBeGreaterThan(100);
    for (const secret of [...secrets, ...hashes]) {
      expect(logs).not.toContain(secret);
    }
    expect(logs).toContain('POST /orders 201'); // el registro de accesos sí está
  });
});

// Los límites de intentos, también con curl: otra instancia de la aplicación con límites bajos y una ventana larga. Con
// TRUST_PROXY=1 la dirección del cliente sale de X-Forwarded-For, así que se puede simular más de una
describe('El límite de intentos con curl y la aplicación compilada (e2e)', () => {
  let server: RunningServer;
  const post = (path: string, body: unknown, ip: string) =>
    curlTo(server.base, 'POST', path, {
      body,
      headers: { 'X-Forwarded-For': ip },
    });
  const attempt = (email: string, ip: string) =>
    post('/auth/login', { email, password: 'mala contraseña larga' }, ip);

  beforeAll(async () => {
    ensureBuilt();
    await resetDatabase();
    server = await startServer({
      RATE_LIMIT_WINDOW_SECONDS: '60',
      RATE_LIMIT_LOGIN_IP: '3',
      RATE_LIMIT_LOGIN_ACCOUNT: '2',
      RATE_LIMIT_REGISTER_IP: '2',
      TRUST_PROXY: '1',
    });
  }, 120_000);
  afterAll(async () => {
    await server?.stop();
  });

  it('el login se corta por cuenta, venga de donde venga, con 429 y Retry-After', () => {
    expect(attempt('ana@example.com', '10.0.0.1').status).toBe(401);
    expect(attempt('ana@example.com', '10.0.0.2').status).toBe(401);

    const blocked = attempt('ana@example.com', '10.0.0.3');

    expect(blocked.status).toBe(429);
    expect(blocked.body.errorCode).toBe('TOO_MANY_REQUESTS');
    expect(blocked.headers['retry-after']).toMatch(/^\d+$/);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // Otro correo, desde otra dirección, sigue pudiendo intentar
    expect(attempt('luis@example.com', '10.0.0.4').status).toBe(401);
  });

  it('el login se corta por dirección aunque cambie el correo', () => {
    for (const email of ['a@example.com', 'b@example.com', 'c@example.com']) {
      expect(attempt(email, '10.0.1.1').status).toBe(401);
    }
    expect(attempt('d@example.com', '10.0.1.1').status).toBe(429);
    expect(attempt('d@example.com', '10.0.1.2').status).toBe(401);
  });

  it('el registro se corta por dirección', () => {
    const register = (email: string) =>
      post(
        '/auth/register',
        { email, password: 'una contraseña larga y buena' },
        '10.0.2.1',
      );
    expect(register('uno@example.com').status).toBe(201);
    expect(register('dos@example.com').status).toBe(201);
    const blocked = register('tres@example.com');
    expect(blocked.status).toBe(429);
    expect(blocked.body.errorCode).toBe('TOO_MANY_REQUESTS');
  });

  it('el catálogo no se limita', () => {
    for (let i = 0; i < 10; i++) {
      expect(
        curlTo(server.base, 'GET', '/books', {
          headers: { 'X-Forwarded-For': '10.0.0.1' },
        }).status,
      ).toBe(200);
    }
  });
});
