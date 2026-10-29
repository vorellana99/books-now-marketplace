import { readdirSync } from 'node:fs';

const BASE = 'test/unit';
const entries = readdirSync(BASE, { withFileTypes: true });

// Las pruebas unitarias se reparten por contexto (tarea 9.12): quien busca la prueba de algo la encuentra donde vive su
// código. Una carpeta por contexto, una para la plataforma, una para el núcleo compartido, una para las reglas que cruzan
// contextos y una para las herramientas de las propias pruebas
describe('estructura de test/unit', () => {
  it('no hay pruebas sueltas en la raíz: todas están en una carpeta', () => {
    const loose = entries.filter((e) => e.isFile()).map((e) => e.name);
    expect(loose).toEqual([]);
  });

  it('las carpetas son las acordadas, y ninguna más', () => {
    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect(folders).toEqual(
      [
        'architecture',
        'catalog',
        'identity',
        'inventory',
        'platform',
        'sales',
        'shared-kernel',
        'tooling',
      ].sort(),
    );
  });

  it.each([
    ['sales', 'order.aggregate.spec.ts'],
    ['sales', 'place-order.handler.spec.ts'],
    ['catalog', 'new-book.spec.ts'],
    ['identity', 'jwt-token.service.spec.ts'],
    ['inventory', 'reserve-stock.handler.spec.ts'],
    ['platform', 'env.schema.spec.ts'],
    ['shared-kernel', 'isbn.vo.spec.ts'],
    ['architecture', 'dependency-rules.spec.ts'],
    ['tooling', 'fakes.spec.ts'],
  ])('%s/ tiene %s', (folder, file) => {
    const names = readdirSync(`${BASE}/${folder}`);
    expect(names).toContain(file);
  });

  it('cada carpeta tiene al menos una prueba', () => {
    for (const folder of entries.filter((e) => e.isDirectory())) {
      const specs = readdirSync(`${BASE}/${folder.name}`).filter((n) =>
        n.endsWith('.spec.ts'),
      );
      expect(specs.length, folder.name).toBeGreaterThan(0);
    }
  });
});
