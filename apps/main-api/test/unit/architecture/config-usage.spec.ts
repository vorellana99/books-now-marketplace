import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'generated' ? [] : sourceFiles(path);
    }
    return path.endsWith('.ts') ? [path] : [];
  });
}

// Cada variable de entorno tiene su valor por defecto en el esquema Zod (`env.schema.ts`) y en ningún otro sitio. Leerla
// con `config.get('X', valor)` crearía una segunda fuente de verdad que se desviaría sin que nadie se entere
describe('uso de la configuración', () => {
  it('ningún código lee una variable con un valor por defecto propio', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(
        /\.get(?:<[^>]*>)?\(\s*'[A-Z][A-Z0-9_]*'\s*,/g,
      )) {
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
