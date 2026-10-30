import { expect, test, type Page } from "@playwright/test";
import { addStock, createBuyer, placeOrder, SEEDED } from "./support/api.ts";
import { DESKTOP, MOBILE, PRODUCTION_BUILD, signIn, violations } from "./support/browser.ts";

// F6.1 · axe con las reglas de WCAG 2.2 AA en el navegador real, en las pantallas de la tienda y en los dos anchos extremos
// (360 px y escritorio). En jsdom axe no calcula estilos: aquí sí se comprueban el contraste y el tamaño de los objetivos
test.beforeAll(async () => {
  await addStock(SEEDED.clean, 50);
  await addStock(SEEDED.ddd, 50);
});

// Cada prueba tiene su comprador: el token de refresco se rota al usarse y no se comparte entre navegadores
const newSession = async (page: Page) => {
  const buyer = await createBuyer();
  await signIn(page, buyer);
  return buyer;
};

const viewports = [
  ["móvil 360 px", MOBILE],
  ["escritorio 1280 px", DESKTOP],
] as const;

const clean = async (page: Page, ready: () => Promise<void>) => {
  await ready();
  expect(await violations(page)).toEqual([]);
};

for (const [name, size] of viewports) {
  test.describe(name, () => {
    test.use({ viewport: size });

    test("PA-01 catálogo y búsqueda", async ({ page }) => {
      await page.goto("/");
      await clean(page, () =>
        expect(page.getByRole("heading", { name: "Libros", level: 1 })).toBeVisible(),
      );
      await page.goto("/?q=clean");
      await clean(page, () => expect(page.getByText("Clean Code").first()).toBeVisible());
    });

    test("PA-02 detalle del libro y libro no disponible", async ({ page }) => {
      await page.goto(`/libros/${SEEDED.clean}`);
      await clean(page, () =>
        expect(page.getByRole("heading", { name: "Clean Code", level: 1 })).toBeVisible(),
      );
      await page.goto("/libros/9780000000002");
      await clean(page, () =>
        expect(page.getByText("Este libro no está disponible.")).toBeVisible(),
      );
    });

    test("PA-03 registro y PA-04 iniciar sesión, vacíos y con errores", async ({ page }) => {
      await page.goto("/registro");
      await clean(page, () =>
        expect(page.getByRole("heading", { name: "Crea tu cuenta", level: 1 })).toBeVisible(),
      );
      await page.getByRole("button", { name: "Crear cuenta" }).click();
      // Los errores de campo no son una alerta: son texto enlazado al campo (`aria-describedby`) y el foco va al primero
      await clean(page, () => expect(page.locator('[aria-invalid="true"]').first()).toBeVisible());
      await page.goto("/ingresar");
      await clean(page, () =>
        expect(page.getByRole("heading", { name: "Entra a tu cuenta", level: 1 })).toBeVisible(),
      );
      await page.getByLabel("Correo electrónico", { exact: true }).fill("nadie@example.com");
      await page.getByLabel("Contraseña", { exact: true }).fill("una contraseña equivocada");
      await page.getByRole("button", { name: "Entrar" }).click();
      await clean(page, () => expect(page.getByRole("alert").first()).toBeVisible());
    });

    test("PA-05 carrito (vacío y con libros), PA-06 compra y su aviso de error", async ({
      page,
    }) => {
      await newSession(page);
      await page.goto("/carrito");
      await clean(page, () => expect(page.getByText("Tu carrito está vacío.")).toBeVisible());
      await page.goto("/");
      await page.getByRole("button", { name: "Agregar Clean Code al carrito" }).click();
      await page.getByRole("button", { name: "Agregar Domain-Driven Design al carrito" }).click();
      await page.goto("/carrito");
      await clean(page, async () => {
        await expect(page.getByText("Total a pagar")).toBeVisible();
        await expect(page.getByRole("link", { name: "Continuar con la compra" })).toBeVisible();
      });
      await page.getByRole("link", { name: "Continuar con la compra" }).click();
      await clean(page, async () => {
        await expect(
          page.getByRole("heading", { name: "Finaliza tu compra", level: 1 }),
        ).toBeVisible();
        await expect(page.getByRole("button", { name: /^Pagar S\// })).toBeEnabled();
      });
      // Con errores de campo (formulario vacío) y con el aviso de tarjeta rechazada
      await page.getByRole("button", { name: /^Pagar S\// }).click();
      await clean(page, () => expect(page.locator('[aria-invalid="true"]').first()).toBeVisible());
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
      // El aviso de tarjeta rechazada necesita el selector de pruebas, que el build de producción no dibuja
      if (PRODUCTION_BUILD) return;
      await page.getByLabel("Tarjeta de prueba").selectOption("tok_declined");
      await page.getByRole("button", { name: /^Pagar S\// }).click();
      await clean(page, () => expect(page.getByText("Tu tarjeta fue rechazada.")).toBeVisible());
    });

    test("PA-07 confirmación, PA-08 mis pedidos, PA-09 detalle y pedido no encontrado", async ({
      page,
    }) => {
      const buyer = await newSession(page);
      const { orderId } = await placeOrder(buyer, [{ isbn: SEEDED.clean, quantity: 1 }]);
      await page.goto(`/pedidos/${orderId}/gracias`);
      await clean(page, () =>
        expect(page.getByRole("heading", { name: "¡Gracias por tu compra!" })).toBeVisible(),
      );
      await page.goto("/pedidos");
      await clean(page, () => expect(page.getByRole("list", { name: "Pedidos" })).toBeVisible());
      await page.goto(`/pedidos/${orderId}`);
      await clean(page, () =>
        expect(page.getByRole("heading", { name: /^Pedido #/, level: 1 })).toBeVisible(),
      );
      await page.goto("/pedidos/00000000-0000-4000-8000-000000000000");
      await clean(page, () => expect(page.getByText("No encontramos este pedido.")).toBeVisible());
    });

    test("PA-10 no encontrado, y el menú de la cuenta y el móvil abiertos", async ({ page }) => {
      await page.goto("/esta-ruta-no-existe");
      await clean(page, () => expect(page.getByRole("heading", { level: 1 })).toBeVisible());
      await newSession(page);
      if (size.width < 768) {
        await page.getByRole("button", { name: "Abrir menú" }).click();
        await clean(page, () =>
          expect(page.getByRole("link", { name: "Mis pedidos" })).toBeVisible(),
        );
      } else {
        await page.getByRole("button", { name: "Mi cuenta" }).click();
        await clean(page, () =>
          expect(page.getByRole("menuitem", { name: "Mis pedidos" })).toBeVisible(),
        );
      }
    });
  });
}
