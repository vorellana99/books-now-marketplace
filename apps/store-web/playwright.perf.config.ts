import { defineConfig } from "@playwright/test";

// Rendimiento: se mide el build de PRODUCCIÓN (`vp build` + `vp preview`), no `vp dev`, que no minifica ni divide en trozos.
// Necesita el backend real en :3000 (el servidor de vista previa reenvía `/api` igual que `vp dev`). Se lanza con
// `pnpm run test:perf`
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:4173";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.perf.ts",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL },
  // Con `E2E_BASE_URL` se mide un servidor que ya está en marcha (por ejemplo, otro build para comparar)
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "vp build && vp preview --port 4173 --strictPort",
        url: baseURL,
        // Nunca se reutiliza un servidor que ya estaba: podría servir un build viejo y se mediría otra cosa
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
