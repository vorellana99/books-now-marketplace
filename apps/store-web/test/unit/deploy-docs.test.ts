import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

const read = (path: string) => readFileSync(path, "utf-8");
const readme = existsSync("README.md") ? read("README.md") : "";
const envSource = read("src/shared/config/env.ts");
const envExample = read(".env.example");
const guide = read("../../docs/frontend/02-estructura-y-puesta-en-marcha.md");

// Las variables que la tienda lee (`env.ts`) y las que declara la plantilla (`.env.example`)
const declared = (text: string) => [
  ...new Set([...text.matchAll(/\bVITE_[A-Z0-9_]+\b/g)].map((m) => m[0])),
];

// F6.4 · Quien despliega la tienda tiene que encontrar en un solo sitio cómo se compila, qué se publica y qué configurar
describe("README de la tienda (despliegue)", () => {
  it("existe y está en español", () => {
    expect(readme.length).toBeGreaterThan(500);
    expect(readme).toMatch(/Despliegue/);
  });

  it("documenta cada variable VITE_* que lee la tienda o declara .env.example", () => {
    const variables = [...new Set([...declared(envSource), ...declared(envExample)])];
    expect(variables).toContain("VITE_API_BASE_URL");
    for (const name of variables) {
      expect(readme, name).toContain(name);
      expect(guide, `la guía 02 no documenta ${name}`).toContain(name);
    }
  });

  it("dice que las VITE_* son públicas y se fijan al compilar", () => {
    expect(readme).toMatch(/públicas/);
    expect(readme).toMatch(/al compilar|en la compilación/);
  });

  it("explica la compilación y qué se publica: `vp build`, `dist/` y la vista previa", () => {
    expect(readme).toContain("vp build");
    expect(readme).toContain("dist/");
    expect(readme).toContain("vp preview");
  });

  it("explica el mismo origen: el proxy inverso que enruta /api al backend sin el prefijo, y la alternativa con CORS", () => {
    expect(readme).toMatch(/mismo origen/);
    expect(readme).toContain("/api");
    expect(readme).toContain("CORS_ORIGINS");
  });

  it("enlaza una configuración de ejemplo de nginx completa: rutas del cliente (SPA), caché y compresión", () => {
    expect(readme).toContain("deploy/nginx.conf");
    expect(readme).toContain("deploy/security-headers.conf");
    const nginx = read("deploy/nginx.conf");
    expect(nginx).toContain("try_files $uri /index.html");
    expect(nginx).toContain("proxy_pass http://127.0.0.1:3000/;"); // con la barra final: quita el prefijo /api
    expect(nginx).toMatch(/immutable/);
    expect(nginx).toMatch(/no-cache/);
    expect(nginx).toMatch(/gzip on/);
    expect(nginx).toContain("X-Forwarded-For");
    expect(readme).toMatch(/nginx/);
    expect(readme).toMatch(/gzip|brotli/i);
  });

  it("lista lo que hay que configurar en el backend: CORS_ORIGINS, TRUST_PROXY, JWT_SECRET y la pasarela de pago", () => {
    for (const name of ["CORS_ORIGINS", "TRUST_PROXY", "JWT_SECRET", "PAYMENT_PROVIDER"]) {
      expect(readme, name).toContain(name);
    }
  });

  it("avisa de lo que falta para cobrar de verdad: la tarjeta de prueba solo existe fuera de producción", () => {
    expect(readme).toMatch(/tarjeta de prueba/i);
    expect(readme).toMatch(/pasarela/i);
  });

  it("enlaza las guías y no deja enlaces locales rotos", () => {
    const links = [...readme.matchAll(/\]\((?!https?:|#)([^)\s#]+)(?:#[^)]*)?\)/g)].map(
      (m) => m[1]!,
    );
    expect(links.length).toBeGreaterThan(2);
    for (const link of links) expect(existsSync(link), link).toBe(true);
  });
});
