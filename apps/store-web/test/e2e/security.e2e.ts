import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { addStock, PASSWORD, SEEDED } from "./support/api.ts";
import { DESKTOP, fillAddress, PRODUCTION_BUILD, REFRESH_KEY } from "./support/browser.ts";

// F6.5 · Seguridad en el navegador real: la política de contenido (CSP) de `deploy/security-headers.conf` aplicada al build de
// producción, y que ningún token ni la contraseña salgan en la URL, en la consola ni en el almacenamiento
test.use({ viewport: DESKTOP });
test.skip(
  !PRODUCTION_BUILD,
  "la CSP se prueba sobre el build de producción (E2E_PRODUCTION_BUILD=1): `vp dev` usa scripts en línea",
);

// Las cabeceras que el despliegue añade, leídas del MISMO archivo que se documenta: lo probado es lo publicado
function deployedHeaders(): Record<string, string> {
  const text = readFileSync("deploy/security-headers.conf", "utf-8");
  return Object.fromEntries(
    [...text.matchAll(/^add_header\s+(\S+)\s+"([^"]+)"/gm)].map((m) => [m[1]!, m[2]!]),
  );
}

declare global {
  interface Window {
    __violations: string[];
  }
}

test("con la CSP del despliegue, el recorrido completo no tiene ninguna violación y no filtra credenciales", async ({
  page,
  context,
}) => {
  const headers = deployedHeaders();
  expect(headers["Content-Security-Policy"]).toContain("script-src 'self'");

  // Como haría nginx: cada respuesta lleva las cabeceras del despliegue
  await context.route("**/*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
  });

  const violations: string[] = [];
  const consoleLines: string[] = [];
  const requestUrls: string[] = [];
  const secrets: string[] = [PASSWORD];
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__violations.push(
        `${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}:${event.columnNumber} ${event.sample}`,
      );
    });
  });
  page.on("console", (message) => consoleLines.push(message.text()));
  page.on("pageerror", (error) => consoleLines.push(`pageerror ${error.message}`));
  page.on("request", (request) => requestUrls.push(request.url()));
  page.on("response", async (response) => {
    if (!/\/api\/auth\/(login|refresh)$/.test(response.url()) || response.status() !== 200) return;
    const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
    for (const token of [body.accessToken, body.refreshToken]) if (token) secrets.push(token);
  });
  const readViolations = () => page.evaluate(() => window.__violations);

  await addStock(SEEDED.clean, 20);
  const email = `e2e-sec-${Date.now()}@example.com`;

  // Registro, búsqueda, agregar, cotizar, pagar, confirmación y pedidos
  await page.goto("/registro");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Libros", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Agregar Clean Code al carrito" }).click();
  await expect(page.getByText("Libro agregado")).toBeVisible();
  await page.getByRole("link", { name: /^Carrito, 1 libro/ }).click();
  await expect(page.getByText("Total a pagar")).toBeVisible();
  await page.getByRole("link", { name: "Continuar con la compra" }).click();
  await expect(page.getByRole("button", { name: /^Pagar S\// })).toBeEnabled();
  await fillAddress(page);
  await page.getByRole("button", { name: /^Pagar S\// }).click();
  await expect(page.getByRole("heading", { name: "¡Gracias por tu compra!" })).toBeVisible();
  await page.getByRole("link", { name: "Ver mis pedidos" }).click();
  await expect(page.getByRole("heading", { name: "Mis pedidos", level: 1 })).toBeVisible();
  // Una pantalla con menú desplegable y otra con error, para que se ejerciten más piezas bajo la política
  await page.getByRole("button", { name: "Mi cuenta" }).click();
  await expect(page.getByRole("menuitem", { name: "Cerrar sesión" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/pedidos/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "No encontramos este pedido." })).toBeVisible();

  // La política no se violó ni una vez, y el navegador no se quejó en la consola
  expect(await readViolations()).toEqual([]);
  violations.push(
    ...consoleLines.filter((line) => /Content Security Policy|Refused to/i.test(line)),
  );
  expect(violations).toEqual([]);
  expect(consoleLines.filter((line) => line.startsWith("pageerror"))).toEqual([]);

  // Las credenciales no se fueron a ningún sitio: ni a una URL (incluida la de la barra de direcciones), ni a la consola
  expect(secrets.length).toBeGreaterThan(2); // la contraseña, y los tokens de acceso y de refresco de esta sesión
  for (const secret of secrets) {
    expect(
      requestUrls.filter((url) => decodeURIComponent(url).includes(secret)),
      "URL de una petición",
    ).toEqual([]);
    expect(decodeURIComponent(page.url())).not.toContain(secret);
    expect(
      consoleLines.filter((line) => line.includes(secret)),
      "consola",
    ).toEqual([]);
  }
  // Y ninguna petición salió del propio origen
  const origin = new URL(page.url()).origin;
  expect(requestUrls.filter((url) => url.startsWith("http") && !url.startsWith(origin))).toEqual(
    [],
  );

  // Almacenamiento: solo el token de refresco bajo su clave; el de acceso y la contraseña, en ningún sitio
  const storage = await page.evaluate(() =>
    [localStorage, sessionStorage].flatMap((s) =>
      Array.from({ length: s.length }, (_, i) => [s.key(i)!, s.getItem(s.key(i)!)!] as const),
    ),
  );
  // Las claves son las de la tienda (`libroya.*`) y la posición de scroll del router: nada más
  const known = (key: string) =>
    key.startsWith("libroya.") || key.startsWith("tsr-scroll-restoration");
  expect(storage.map(([key]) => key).filter((key) => !known(key))).toEqual([]);
  const refresh = storage.find(([key]) => key === REFRESH_KEY)?.[1];
  expect(refresh).toBeTruthy();
  for (const [key, value] of storage) {
    for (const secret of secrets.filter((s) => s !== refresh)) {
      expect(value, `${key} guarda una credencial`).not.toContain(secret);
    }
  }

  // Cerrar sesión borra el token de refresco
  await page.goto("/pedidos");
  await page.getByRole("button", { name: "Mi cuenta" }).click();
  await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY)).toBeNull();
  expect(await readViolations()).toEqual([]);
});
