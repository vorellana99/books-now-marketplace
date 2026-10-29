// Reglas de dependencias entre carpetas. Ver docs/frontend/01-decisiones-y-stack.md, sección 3:
//  - una funcionalidad no importa las entrañas de otra: solo su `index.ts`
//  - `shared/` no importa de `features/`, `routes/` ni `app/`
//  - solo `shared/api/` y los `api.ts` de cada funcionalidad conocen `openapi-fetch` y llaman a `fetch`
//  - los tipos de la API se importan de `shared/api/types.ts`, nunca de `schema.d.ts`

const withoutComments = (source: string): string =>
  source
    .replaceAll(/\/\*[\s\S]*?\*\//g, "") // comentarios de bloque
    .replaceAll(/^\s*\/\/.*$/gm, "") // comentarios de línea completos
    .replaceAll(/\s\/\/.*$/gm, ""); // comentarios al final de una línea

/** Rutas importadas por un archivo, con los imports de solo tipos, las re-exportaciones y los dinámicos. */
export function importsOf(source: string): string[] {
  const code = withoutComments(source);
  const specifiers: string[] = [];
  const statics = /^\s*(?:import|export)\b(?:[^;'"`]*?\bfrom)?\s*['"]([^'"]+)['"]/gm;
  for (const match of code.matchAll(statics)) specifiers.push(match[1] ?? "");
  const dynamics = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of code.matchAll(dynamics)) specifiers.push(match[1] ?? "");
  return specifiers;
}

/** Usa la red: `fetch(` suelto, como función o con `window.` / `globalThis.` delante. */
export const usesFetch = (source: string): boolean =>
  /(^|[^\w.])(?:window\.|globalThis\.|self\.)?fetch\s*\(/m.test(withoutComments(source));

/** 'shared' | 'routes' | 'app' | 'features/<nombre>' | 'other'. */
export function zoneOf(path: string): string {
  const feature = /^src\/features\/([^/]+)\//.exec(path);
  if (feature) return `features/${feature[1]}`;
  if (path.startsWith("src/shared/")) return "shared";
  if (path.startsWith("src/routes/")) return "routes";
  if (path.startsWith("src/app/")) return "app";
  return "other";
}

// `@/features/cart/index.ts` -> { feature: "cart", rest: "index.ts" }
const featureTarget = (spec: string) => {
  const match = /^@\/features\/([^/]+)\/(.+)$/.exec(spec);
  return match ? { feature: match[1] ?? "", rest: match[2] ?? "" } : null;
};

const isApiLayer = (file: string) =>
  file.startsWith("src/shared/api/") || /^src\/features\/[^/]+\/api\.ts$/.test(file);

/** Violaciones de las reglas en un conjunto de archivos (ruta -> código). Vacío si todo está bien. */
export function checkRules(files: Record<string, string>): string[] {
  const violations: string[] = [];

  for (const [file, source] of Object.entries(files)) {
    const zone = zoneOf(file);

    for (const spec of importsOf(source)) {
      const reason = reasonToReject(file, zone, spec);
      if (reason) violations.push(`${file}: importa '${spec}': ${reason}`);
    }

    if (!isApiLayer(file) && usesFetch(source)) {
      violations.push(
        `${file}: usa fetch; solo shared/api/ y los api.ts de cada funcionalidad hablan con la red`,
      );
    }
  }
  return violations;
}

function reasonToReject(file: string, zone: string, spec: string): string | undefined {
  if (spec === "openapi-fetch" && !isApiLayer(file)) {
    return "solo shared/api/ y los api.ts de cada funcionalidad conocen openapi-fetch";
  }

  if (/(^|\/)schema(\.d\.ts)?$/.test(spec) && file !== "src/shared/api/types.ts") {
    return "los tipos de la API se importan de shared/api/types.ts, no de schema.d.ts";
  }

  if (zone === "shared" && /^@\/(features|routes|app)\//.test(spec)) {
    return "shared/ no puede importar de features/, routes/ ni app/";
  }

  const target = featureTarget(spec);
  if (target && zone.startsWith("features/")) {
    const own = zone.slice("features/".length);
    if (target.feature !== own && target.rest !== "index.ts") {
      return `una funcionalidad solo puede importar de otra por su features/${target.feature}/index.ts`;
    }
  }
  return undefined;
}
