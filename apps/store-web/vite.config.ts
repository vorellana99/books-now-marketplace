import { tanstackRouter } from "@tanstack/router-plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite-plus";

// Archivos que genera una herramienta: no se formatean ni se revisan
const generated = ["src/routeTree.gen.ts", "src/shared/api/schema.d.ts"];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");

  return {
    plugins: [
      // Va antes que React: genera `routeTree.gen.ts` a partir de `src/routes/`
      tanstackRouter({ target: "react", autoCodeSplitting: true }),
      react(),
      tailwindcss(),
    ],
    resolve: { tsconfigPaths: true },
    server: {
      // La API todavía no tiene CORS (tarea 7.10 del backend): el navegador llama a su propio origen
      // y Vite reenvía `/api/*` al backend, sin el prefijo
      proxy: {
        "/api": {
          target: env.VITE_API_PROXY_TARGET || "http://localhost:3000",
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    test: {
      environment: "jsdom",
      include: ["test/**/*.test.{ts,tsx}"],
      setupFiles: ["test/support/setup.ts"],
      // axe recorre todo el DOM de una pantalla: con la máquina cargada una prueba de accesibilidad puede pasar de los 5 s por defecto
      testTimeout: 15_000,
    },
    fmt: { ignorePatterns: generated },
    lint: {
      ignorePatterns: generated,
      jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
      rules: { "vite-plus/prefer-vite-plus-imports": "error" },
      options: { typeAware: true, typeCheck: true },
    },
  };
});
