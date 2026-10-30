import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const read = (path: string) => readFileSync(path, "utf-8");
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".gen.ts") && !name.endsWith(".d.ts")
      ? [path]
      : [];
  });

// F6.5 · Lo que la tienda nunca debe hacer, comprobado en todo `src/` para que un cambio futuro no lo cuele
describe("el código no abre puertas de inyección ni escribe tokens en consola", () => {
  const files = sources("src").map((path) => [path, read(path)] as const);

  it.each([
    ["dangerouslySetInnerHTML", /dangerouslySetInnerHTML/],
    ["innerHTML / outerHTML", /\b(inner|outer)HTML\b/],
    ["insertAdjacentHTML", /insertAdjacentHTML/],
    ["document.write", /document\.write/],
    ["eval", /\beval\s*\(/],
    ["new Function", /new\s+Function\s*\(/],
    ["setTimeout / setInterval con texto", /set(Timeout|Interval)\s*\(\s*["'`]/],
  ])("no usa %s", (_name, pattern) => {
    expect(files.filter(([, text]) => pattern.test(text)).map(([path]) => path)).toEqual([]);
  });

  it("no escribe nada en la consola (un token o una contraseña en un log no se borra)", () => {
    expect(files.filter(([, text]) => /\bconsole\./.test(text)).map(([path]) => path)).toEqual([]);
  });

  it("no manda datos a otro sitio: ningún fetch ni XHR a una URL absoluta fuera de la API", () => {
    expect(
      files.filter(([, text]) => /fetch\(\s*["'`]https?:/.test(text)).map(([path]) => path),
    ).toEqual([]);
  });

  it("no guarda el token de acceso en un almacenamiento: solo se nombra la clave del de refresco", () => {
    const writers = files.filter(([, text]) => /(local|session)Storage\.setItem/.test(text));
    for (const [path, text] of writers) {
      expect(text, path).not.toMatch(/setItem\([^)]*access/i);
    }
  });
});

describe("cabeceras de seguridad del despliegue (deploy/)", () => {
  const headers = existsSync("deploy/security-headers.conf")
    ? read("deploy/security-headers.conf")
    : "";
  const csp = /add_header\s+Content-Security-Policy\s+"([^"]+)"/.exec(headers)?.[1] ?? "";
  const directive = (name: string) =>
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `) || d === name);

  it("existe y define una Content-Security-Policy", () => {
    expect(headers.length).toBeGreaterThan(100);
    expect(csp.length).toBeGreaterThan(50);
  });

  it("los scripts solo vienen del propio origen: sin 'unsafe-inline', 'unsafe-eval' ni comodines", () => {
    const script = directive("script-src");
    expect(script).toBe("script-src 'self'");
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/\*/);
    expect(csp).not.toMatch(/https?:/);
  });

  it.each([
    ["default-src", "default-src 'self'"],
    ["object-src", "object-src 'none'"],
    ["base-uri", "base-uri 'self'"],
    ["form-action", "form-action 'self'"],
    ["frame-ancestors", "frame-ancestors 'none'"],
    ["connect-src", "connect-src 'self'"],
  ])("fija %s", (name, expected) => {
    expect(directive(name)).toBe(expected);
  });

  it("añade las demás cabeceras: nosniff, política de referente, permisos y HSTS", () => {
    expect(headers).toMatch(/add_header\s+X-Content-Type-Options\s+"nosniff"/);
    expect(headers).toMatch(/add_header\s+Referrer-Policy\s+"strict-origin-when-cross-origin"/);
    expect(headers).toMatch(/add_header\s+Permissions-Policy\s+"[^"]*camera=\(\)/);
    expect(headers).toMatch(/add_header\s+Strict-Transport-Security\s+"max-age=\d+/);
  });

  it("todas llevan `always`, para que también salgan en los errores", () => {
    const lines = headers.split("\n").filter((l) => l.trim().startsWith("add_header"));
    expect(lines.length).toBeGreaterThanOrEqual(5);
    for (const line of lines) expect(line).toMatch(/\balways;/);
  });

  it("el nginx de ejemplo la incluye en cada `location` (un add_header propio descarta los del nivel superior)", () => {
    const nginx = existsSync("deploy/nginx.conf") ? read("deploy/nginx.conf") : "";
    expect(nginx).toContain("security-headers.conf"); // se copia como libroya-security-headers.conf
    const locations = nginx.match(/location\s+[^{]+\{[^}]*\}/g) ?? [];
    expect(locations.length).toBeGreaterThanOrEqual(3);
    for (const location of locations) {
      if (/add_header/.test(location)) expect(location).toContain("include");
    }
  });
});
