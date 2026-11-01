import { expect, test, type Page } from "@playwright/test";
import { addStock, createBuyer, SEEDED } from "./support/api.ts";

// F6.3 · Los objetivos de rendimiento de `docs/product/08-requisitos-de-experiencia.md`, medidos en el navegador sobre el build
// de producción y en un teléfono de gama media con 4G: CPU 4 veces más lenta y el perfil de red «4G lento» de Lighthouse
// (1.6 Mbps de bajada, 750 kbps de subida, 150 ms de latencia), que es el peor caso razonable. Con una 4G típica sale mejor
const LIMITS = { lcpMs: 2500, inpMs: 200, cls: 0.1, assetsKB: 700 };

declare global {
  interface Window {
    __perf: { lcp: number; cls: number; interactions: { name: string; duration: number }[] };
  }
}

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  // Los tres indicadores, tal como los define la plataforma web
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, cls: 0, interactions: [] };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__perf.lcp = entry.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) window.__perf.cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        interactionId: number;
        name: string;
        duration: number;
      }[]) {
        if (entry.interactionId)
          window.__perf.interactions.push({ name: entry.name, duration: entry.duration });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  });
}

test.use({
  viewport: { width: 360, height: 740 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

test("el catálogo carga con LCP ≤ 2.5 s, CLS ≤ 0.1 y un JS inicial acotado", async ({ page }) => {
  await throttle(page);
  const assets: { url: string; kb: number }[] = [];
  page.on("response", async (response) => {
    const type = response.request().resourceType();
    if (!["script", "stylesheet", "font"].includes(type)) return;
    assets.push({ url: response.url(), kb: (await response.body()).length / 1024 });
  });

  await page.goto("/");
  await expect(page.getByText("Clean Code").first()).toBeVisible();
  await page.waitForTimeout(1500); // deja que se asienten los últimos cambios de diseño
  const { lcp, cls } = await page.evaluate(() => window.__perf);
  console.log(`LCP ${Math.round(lcp)} ms · CLS ${cls.toFixed(4)} · ${assets.length} recursos`);

  expect(lcp).toBeGreaterThan(0);
  expect(lcp).toBeLessThanOrEqual(LIMITS.lcpMs);
  expect(cls).toBeLessThanOrEqual(LIMITS.cls);
  // Solo se baja el subconjunto latino de cada tipografía (el navegador pide los demás solo si hay esos caracteres)
  const fonts = assets.filter((a) => a.url.endsWith(".woff2"));
  expect(fonts.filter((f) => !/-latin(-ext)?-/.test(f.url)).map((f) => f.url)).toEqual([]);
  // Lo que baja al abrir la tienda (sin comprimir: `vp preview` no comprime): un presupuesto, para notar un salto
  const total = assets.filter((a) => !a.url.endsWith(".woff2")).reduce((sum, a) => sum + a.kb, 0);
  console.log(`JS y CSS iniciales: ${Math.round(total)} kB sin comprimir`);
  expect(total).toBeLessThanOrEqual(LIMITS.assetsKB);
});

test("INP ≤ 200 ms en el recorrido de compra (buscar, agregar, carrito, cantidad, pagar)", async ({
  page,
}) => {
  await addStock(SEEDED.clean, 20);
  const buyer = await createBuyer();
  // Con la red y la CPU ya limitadas desde la primera página: nada llega precargado en la caché del navegador
  await throttle(page);
  await page.goto("/ingresar");
  await page.evaluate(
    (token) => localStorage.setItem("libroya.refresh", token),
    buyer.refreshToken,
  );
  await page.goto("/");
  await expect(page.getByText("Clean Code").first()).toBeVisible();
  // Las rutas de la compra se precargan en un momento libre tras el primer pintado
  await page.waitForTimeout(2500);

  const step = async (action: () => Promise<unknown>) => {
    await action();
    await page.waitForTimeout(600);
  };
  await step(() => page.getByRole("button", { name: "Buscar", exact: true }).first().tap());
  await step(() => page.getByRole("searchbox").first().pressSequentially("clean", { delay: 60 }));
  await step(() => page.getByRole("searchbox").first().fill(""));
  await step(() =>
    page
      .getByRole("button", { name: /^Agregar .* al carrito$/ })
      .first()
      .tap(),
  );
  await step(() => page.getByRole("link", { name: /^Carrito/ }).tap());
  await expect(page.getByText("Total a pagar")).toBeVisible();
  await step(() => page.getByRole("combobox").first().selectOption("2"));
  await expect(page.getByText("Total a pagar")).toBeVisible();
  await step(() => page.getByRole("link", { name: "Continuar con la compra" }).tap());
  await expect(page.getByLabel("Destinatario")).toBeVisible();
  await step(() =>
    page.getByLabel("Destinatario").pressSequentially("María Quispe", { delay: 60 }),
  );

  const { interactions } = await page.evaluate(() => window.__perf);
  const worst = Math.max(0, ...interactions.map((i) => i.duration));
  console.log(`${interactions.length} eventos de interacción · el más lento: ${worst} ms`);
  console.log(
    JSON.stringify([...interactions].sort((a, b) => b.duration - a.duration).slice(0, 5)),
  );
  expect(interactions.length).toBeGreaterThan(5);
  expect(worst).toBeLessThanOrEqual(LIMITS.inpMs);
});
