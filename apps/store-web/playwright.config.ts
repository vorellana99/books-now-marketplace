import { defineConfig } from "@playwright/test";

// Las pruebas e2e se ejecutan contra el backend REAL (PostgreSQL + `pnpm run start:dev` en :3000, con la pasarela y el correo
// simulados) y la tienda en `vp dev` (:5173). Se lanzan con `pnpm run test:e2e`; no están en la compuerta ni en el CI porque
// necesitan ese backend levantado (ver docs/frontend/06-tests.md)
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:5173";

export default defineConfig({
  testDir: "test/e2e",
  testMatch: "**/*.e2e.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Comparten una sola base de datos y crean sus propios datos: se ejecutan uno tras otro
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "vp dev --port 5173", url: baseURL, reuseExistingServer: true, timeout: 60_000 },
});
