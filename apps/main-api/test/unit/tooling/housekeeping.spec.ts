import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  description?: string;
  author?: string;
  scripts: Record<string, string>;
};

// Lo que quedó de la plantilla de Nest y ya no dice la verdad (tarea 9.12)
describe('limpieza de la plantilla', () => {
  it('package.json describe la aplicación', () => {
    expect(pkg.description?.trim()).toBeTruthy();
    expect(pkg.description).toMatch(/LibroYa/);
  });

  it('package.json no trae un autor vacío', () => {
    expect(pkg.author ?? 'x').not.toBe('');
  });

  it('no queda el script `deploy` de la plantilla (nadie lo usa y necesita un plugin que no está)', () => {
    expect(pkg.scripts).not.toHaveProperty('deploy');
  });

  it('vitest.config.ts no conserva el comentario de `nest g library`', () => {
    expect(readFileSync('vitest.config.ts', 'utf8')).not.toMatch(
      /nest g library/,
    );
  });

  it('el script `verify` y los de prueba siguen', () => {
    for (const name of ['verify', 'test', 'test:e2e', 'lint', 'build']) {
      expect(pkg.scripts, name).toHaveProperty(name);
    }
  });
});
