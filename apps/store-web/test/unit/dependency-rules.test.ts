import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";
import { checkRules, importsOf } from "../support/architecture.ts";

// Archivos que genera una herramienta
const GENERATED = new Set(["src/routeTree.gen.ts", "src/shared/api/schema.d.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !GENERATED.has(path) ? [path] : [];
  });
}

describe("reglas de dependencia de src/", () => {
  it("el código actual las cumple", () => {
    const files = Object.fromEntries(
      sourceFiles("src").map((path) => [path, readFileSync(path, "utf-8")]),
    );
    expect(Object.keys(files).length).toBeGreaterThan(10);
    expect(checkRules(files)).toEqual([]);
  });
});

describe("checkRules detecta las violaciones", () => {
  it("una funcionalidad que importa las entrañas de otra", () => {
    const violations = checkRules({
      "src/features/checkout/pay.ts": 'import { store } from "@/features/cart/cart.store.ts";',
    });
    expect(violations).toHaveLength(1);
  });

  it("pero permite el index.ts de otra funcionalidad y lo propio", () => {
    expect(
      checkRules({
        "src/features/checkout/pay.ts":
          'import { useCart } from "@/features/cart/index.ts";\nimport { x } from "@/features/checkout/helpers.ts";',
      }),
    ).toEqual([]);
  });

  it("shared/ que importa de features/, routes/ o app/", () => {
    for (const target of ["@/features/auth/index.ts", "@/routes/__root.tsx", "@/app/header.tsx"]) {
      expect(checkRules({ "src/shared/lib/x.ts": `import { a } from "${target}";` })).toHaveLength(
        1,
      );
    }
  });

  it("fetch fuera de shared/api y de los api.ts", () => {
    expect(
      checkRules({ "src/features/catalog/pages/list.tsx": "const r = await fetch('/x');" }),
    ).toHaveLength(1);
    expect(checkRules({ "src/app/x.ts": "window.fetch('/x');" })).toHaveLength(1);
    expect(checkRules({ "src/features/catalog/api.ts": "const r = await fetch('/x');" })).toEqual(
      [],
    );
    expect(checkRules({ "src/shared/api/client.ts": "return fetch(original);" })).toEqual([]);
  });

  it("no confunde una palabra que termina en fetch ni un comentario", () => {
    expect(checkRules({ "src/app/x.ts": "const prefetch = 1; // fetch(x)\nprefetch(2);" })).toEqual(
      [],
    );
  });

  it("openapi-fetch fuera de shared/api y de los api.ts", () => {
    expect(checkRules({ "src/app/x.ts": 'import c from "openapi-fetch";' })).toHaveLength(1);
    expect(checkRules({ "src/features/auth/api.ts": 'import c from "openapi-fetch";' })).toEqual(
      [],
    );
  });

  it("schema.d.ts importado desde otro lado que no sea types.ts", () => {
    expect(
      checkRules({ "src/app/x.ts": 'import type { paths } from "@/shared/api/schema.d.ts";' }),
    ).toHaveLength(1);
    expect(
      checkRules({ "src/shared/api/types.ts": 'import type { paths } from "./schema.d.ts";' }),
    ).toEqual([]);
  });
});

describe("importsOf", () => {
  it("lee imports estáticos, de solo tipos, re-exportaciones y dinámicos, sin los comentarios", () => {
    const source = `
      import a from "a";
      import type { B } from "b";
      export { c } from "c";
      // import x from "comentario";
      const d = await import("d");
    `;
    expect(importsOf(source)).toEqual(["a", "b", "c", "d"]);
  });
});
