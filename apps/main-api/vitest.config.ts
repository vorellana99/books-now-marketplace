import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Resuelve los alias de rutas de tsconfig.json (requiere Vite 8, que trae esta opción)
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/unit/**/*.spec.ts'],
  },
});
