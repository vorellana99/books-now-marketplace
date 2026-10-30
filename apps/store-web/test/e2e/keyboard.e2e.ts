import { expect, test } from "@playwright/test";
import { addStock, createBuyer, SEEDED } from "./support/api.ts";
import { DESKTOP, MOBILE, signIn } from "./support/browser.ts";
import { expectFocusAlwaysVisible, tabTo, type Trail } from "./support/keyboard.ts";

// F6.1 · el recorrido de compra completo SOLO con teclado (Tab, Enter, Espacio y escribir): agregar un libro, el carrito, la
// dirección, el pago, la confirmación y el detalle del pedido. En cada parada el foco se ve
for (const [name, size] of [
  ["escritorio", DESKTOP],
  ["móvil", MOBILE],
] as const) {
  test(`comprar solo con teclado (${name})`, async ({ page }) => {
    test.setTimeout(120_000);
    await addStock(SEEDED.clean, 20);
    await page.setViewportSize(size);
    await signIn(page, await createBuyer());
    await expect(page.getByRole("heading", { name: "Libros", level: 1 })).toBeVisible();
    const trail: Trail = { stops: [] };

    // Catálogo: agregar Clean Code
    await tabTo(page, "Agregar Clean Code al carrito", trail);
    await page.keyboard.press("Enter");
    await expect(page.getByText("Libro agregado")).toBeVisible();

    // Cabecera: el carrito
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await tabTo(page, /^Carrito, 1 libro/, trail).catch(async () => {
      // el enlace del carrito está antes en el orden de tabulación: se vuelve a recorrer desde el principio
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await tabTo(page, /^Carrito, 1 libro/, trail);
    });
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Tu carrito", level: 1 })).toBeVisible();

    // Carrito: continuar (espera a que haya total vigente: el enlace solo existe entonces)
    await expect(page.getByText("Total a pagar")).toBeVisible();
    await tabTo(page, "Continuar con la compra", trail);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Finaliza tu compra", level: 1 })).toBeVisible();

    // Compra: la dirección, escribiendo en cada campo
    const values: [string, string][] = [
      ["Destinatario", "María Quispe"],
      ["Teléfono", "+51 987 654 321"],
      ["Dirección", "Jr. Ucayali 150, Dpto 2"],
      ["Distrito", "Barranco"],
      ["Provincia", "Lima"],
      ["Departamento", "Lima"],
    ];
    for (const [label, value] of values) {
      await tabTo(page, label, trail);
      await page.keyboard.type(value);
    }
    // El selector de la tarjeta de prueba se maneja con el teclado (Aprobada es la primera opción)
    await tabTo(page, "Tarjeta de prueba", trail);
    await expect(page.getByRole("button", { name: /^Pagar S\// })).toBeEnabled();
    await tabTo(page, /^Pagar S\//, trail);
    await page.keyboard.press("Enter");

    // Confirmación
    await expect(
      page.getByRole("heading", { name: "¡Gracias por tu compra!", level: 1 }),
    ).toBeVisible();
    await tabTo(page, "Ver mis pedidos", trail);
    await page.keyboard.press("Enter");

    // Mis pedidos y el detalle
    await expect(page.getByRole("heading", { name: "Mis pedidos", level: 1 })).toBeVisible();
    await tabTo(page, /^#[0-9A-F]{8}/, trail);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^Pedido #/, level: 1 })).toBeVisible();
    await expect(page.getByText("María Quispe")).toBeVisible();

    expectFocusAlwaysVisible(trail);
  });
}

test("«Saltar al contenido» es la primera parada y lleva al contenido principal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Libros", level: 1 })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#contenido");
});
