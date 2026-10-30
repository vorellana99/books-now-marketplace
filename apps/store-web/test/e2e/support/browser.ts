import axe from "axe-core";
import { expect, type Page } from "@playwright/test";
import type { Buyer } from "./api.ts";

export const MOBILE = { width: 360, height: 740 };
export const DESKTOP = { width: 1280, height: 800 };

export const REFRESH_KEY = "libroya.refresh";

// Deja la sesión de `buyer` iniciada en este navegador, como si hubiera entrado antes: planta su token de refresco **una sola
// vez** (el token se rota al usarse: plantarlo en cada navegación lo reutilizaría y la API revocaría la sesión) y espera a que
// la tienda lo canjee. El formulario de entrada se prueba en `purchase.e2e.ts`; aquí no se hace login por pantalla en cada
// prueba porque el límite de intentos de la API (5 por cuenta por minuto) lo impediría
export async function signIn(page: Page, buyer: Pick<Buyer, "refreshToken">) {
  await page.goto("/ingresar");
  await page.evaluate(([key, token]) => localStorage.setItem(key, token), [
    REFRESH_KEY,
    buyer.refreshToken,
  ] as const);
  await page.goto("/");
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), REFRESH_KEY))
    .not.toBe(buyer.refreshToken);
}

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type AxeResult = {
  violations: { id: string; help: string; nodes: { target: unknown[]; html: string }[] }[];
};

// axe en el navegador real, con sus reglas de WCAG 2.2 AA. A diferencia de jsdom, aquí SÍ hay estilos calculados: comprueba el
// contraste de color y el tamaño de los objetivos táctiles
export async function violations(page: Page): Promise<string[]> {
  await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(
    async (tags) =>
      (
        window as unknown as {
          axe: { run: (c: Document, o: unknown) => Promise<AxeResult> };
        }
      ).axe.run(document, { runOnly: { type: "tag", values: tags } }),
    TAGS,
  );
  return result.violations.map(
    (v) =>
      `${v.id}: ${v.help} → ${v.nodes.map((n) => `${n.target.join(" ")} ${n.html.slice(0, 90)}`).join(" | ")}`,
  );
}

// Lo que hace una persona en PA-06: escribir la dirección de envío y pagar con la tarjeta de prueba elegida
export async function fillAddress(page: Page) {
  for (const [label, value] of Object.entries({
    Destinatario: "María Quispe",
    Teléfono: "+51 987 654 321",
    Dirección: "Jr. Ucayali 150, Dpto 2",
    Distrito: "Barranco",
    Provincia: "Lima",
    Departamento: "Lima",
  })) {
    await page.getByLabel(label).fill(value);
  }
}

// Un libro al carrito desde su página, y al carrito
export async function addFromDetail(page: Page, isbn: string) {
  await page.goto(`/libros/${isbn}`);
  await page.getByRole("button", { name: "Agregar al carrito" }).click();
  await expect(page.getByText("Libro agregado")).toBeVisible();
}

// Del carrito a la pantalla de pago, con el total ya cotizado
export async function goToCheckout(page: Page) {
  await page.goto("/carrito");
  await page.getByRole("link", { name: "Continuar con la compra" }).click();
  await expect(page.getByRole("heading", { name: "Finaliza tu compra", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagar S\// })).toBeEnabled();
}
