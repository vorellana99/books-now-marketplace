import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { z } from "zod";
import "@/shared/lib/zod.ts";

// zod 4 compila sus validadores con `new Function` cuando puede, y para saberlo lo prueba: con una CSP sin `'unsafe-eval'` esa
// prueba es una violación que el navegador reporta (aunque zod la atrape y siga). Se desactiva esa compilación: los esquemas
// de la tienda son pequeños y validan un puñado de campos
describe("zod sin compilación en tiempo de ejecución", () => {
  it("queda en modo jitless", () => {
    expect(z.config().jitless).toBe(true);
  });

  it("no evalúa código al validar un objeto: `new Function` no se llama", () => {
    const original = globalThis.Function;
    let calls = 0;
    globalThis.Function = new Proxy(original, {
      construct(target, args) {
        calls += 1;
        return Reflect.construct(target, args);
      },
    });
    try {
      const schema = z.object({ email: z.string().email(), age: z.number().int() });
      expect(schema.safeParse({ email: "ana@example.com", age: 30 }).success).toBe(true);
      expect(schema.safeParse({ email: "x", age: 1.5 }).success).toBe(false);
    } finally {
      globalThis.Function = original;
    }
    expect(calls).toBe(0);
  });
});

// El orden de evaluación de los módulos NO lo decide `main.tsx`: Rollup pone el código compartido en trozos que se evalúan antes
// (la sonda de zod corría antes de la configuración y la CSP la veía). Por eso la configuración vive en el único módulo por el
// que se importa `z`, y ese módulo se evalúa antes que cualquiera que construya un esquema
describe("todo el código importa `z` de shared/lib/zod.ts", () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });

  it("ningún archivo de src/ importa de «zod» directamente, salvo ese módulo", () => {
    const offenders = sources("src").filter(
      (path) =>
        path !== join("src", "shared", "lib", "zod.ts") &&
        /from\s+["']zod(\/[^"']*)?["']/.test(readFileSync(path, "utf-8")),
    );
    expect(offenders).toEqual([]);
  });
});
