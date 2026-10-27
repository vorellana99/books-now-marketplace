import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/{integration,e2e}/**/*.spec.ts'],
    // Levanta postgres:18 en un contenedor, aplica las migraciones y define DB_*
    globalSetup: ['./test/support/global-setup.ts'],
    // Todos los archivos comparten ese contenedor: si corrieran a la vez, el vaciado de uno borraría los datos de otro
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
