import { expect, test } from "@playwright/test";
import {
  addStock,
  call,
  createBook,
  createBuyer,
  loginApi,
  ordersOf,
  PASSWORD,
  SEEDED,
} from "./support/api.ts";
import {
  addFromDetail,
  DESKTOP,
  fillAddress,
  goToCheckout,
  PRODUCTION_BUILD,
  signIn,
} from "./support/browser.ts";

// F6.2 · El recorrido de compra contra el backend REAL, por la pantalla: lo que MSW no puede comprobar (el contrato de
// verdad, el Outbox, la reserva de stock, el cobro simulado y la idempotencia)
test.use({ viewport: DESKTOP });

const money = /S\/ \d[\d,]*\.\d{2}/;

test("registro → buscar → agregar → cotizar → pagar → confirmación → mis pedidos → detalle", async ({
  page,
}) => {
  await addStock(SEEDED.clean, 20);
  const email = `e2e-reg-${Date.now()}@example.com`;

  // Registro: la cuenta se crea y la sesión se inicia sola
  await page.goto("/registro");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("heading", { name: "Libros", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi cuenta" })).toBeVisible();

  // Buscar y agregar
  await page.getByRole("searchbox", { name: "Buscar por título o autor" }).fill("clean");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/q=clean/);
  await page.getByRole("button", { name: "Agregar Clean Code al carrito" }).click();
  await expect(page.getByText("Libro agregado")).toBeVisible();

  // Cotizar: el carrito muestra el total que calcula el backend (la tienda no suma)
  await page.getByRole("link", { name: /^Carrito, 1 libro/ }).click();
  await expect(page.getByRole("heading", { name: "Tu carrito", level: 1 })).toBeVisible();
  const total = page.getByText("Total a pagar").locator("xpath=following-sibling::*");
  await expect(total).toHaveText(money);
  const quoted = (await total.textContent())!.trim();
  expect(quoted).toBe("S/ 55.00"); // 45.00 + envío S/ 10.00 (no llega a S/ 150.00)

  // Pagar
  await page.getByRole("link", { name: "Continuar con la compra" }).click();
  await expect(page.getByRole("heading", { name: "Finaliza tu compra", level: 1 })).toBeVisible();
  await fillAddress(page);
  await expect(page.getByRole("button", { name: `Pagar ${quoted}` })).toBeEnabled();
  await page.getByRole("button", { name: `Pagar ${quoted}` }).click();

  // Confirmación: el total cobrado es el cotizado, y recargar muestra lo mismo
  await expect(
    page.getByRole("heading", { name: "¡Gracias por tu compra!", level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}\/gracias$/);
  const charged = page.getByText("Total cobrado").locator("xpath=following-sibling::*");
  await expect(charged).toHaveText(quoted);
  await page.reload();
  await expect(page.getByRole("heading", { name: "¡Gracias por tu compra!" })).toBeVisible();
  await expect(charged).toHaveText(quoted);
  // El carrito quedó vacío
  await expect(page.getByRole("link", { name: /^Carrito, \d/ })).toHaveCount(0);

  // Mis pedidos y su detalle
  await page.getByRole("link", { name: "Ver mis pedidos" }).click();
  await expect(page.getByRole("heading", { name: "Mis pedidos", level: 1 })).toBeVisible();
  const rows = page.getByRole("list", { name: "Pedidos" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(quoted);
  await rows.first().getByRole("link").click();
  await expect(page.getByRole("heading", { name: /^Pedido #/, level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Libros del pedido" })).toContainText("Clean Code");
  await expect(page.getByRole("region", { name: "Envío" })).toContainText("María Quispe");

  // Y la API real coincide con lo que se vio
  const mine = await ordersOf(await loginApi(email, PASSWORD));
  expect(mine).toHaveLength(1);
  expect(`S/ ${mine[0]!.charged.amount}`).toBe(quoted);
});

test("tarjeta rechazada (tok_declined): no se cobra, no se crea ningún pedido y con otra tarjeta se compra", async ({
  page,
}) => {
  test.skip(PRODUCTION_BUILD, "el build de producción no ofrece tarjetas de prueba");
  await addStock(SEEDED.clean, 20);
  const buyer = await createBuyer();
  await signIn(page, buyer);
  await addFromDetail(page, SEEDED.clean);
  await goToCheckout(page);
  await fillAddress(page);
  await page.getByLabel("Tarjeta de prueba").selectOption("tok_declined");
  await page.getByRole("button", { name: /^Pagar S\// }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Tu tarjeta fue rechazada.");
  await expect(alert).toContainText("No se te cobró nada.");
  expect(await ordersOf(buyer)).toHaveLength(0);
  // Nada se perdió: la dirección sigue escrita y el carrito intacto
  await expect(page.getByLabel("Destinatario")).toHaveValue("María Quispe");
  await expect(page.getByRole("link", { name: /^Carrito, 1 libro/ })).toBeVisible();

  await page.getByRole("button", { name: "Probar con otra tarjeta" }).click();
  await expect(page.getByLabel("Tarjeta de prueba")).toBeFocused();
  await page.getByLabel("Tarjeta de prueba").selectOption("tok_visa");
  await page.getByRole("button", { name: /^Pagar S\// }).click();
  await expect(page.getByRole("heading", { name: "¡Gracias por tu compra!" })).toBeVisible();
  expect(await ordersOf(buyer)).toHaveLength(1);
});

test("falta de stock: lo dice sin cobrar, ofrece volver al carrito y no crea el pedido", async ({
  page,
}) => {
  const isbn = await createBook("Libro con una sola unidad e2e");
  await addStock(isbn, 1); // espera a que Inventario cree el registro del libro y deja 1 unidad
  const buyer = await createBuyer();
  await signIn(page, buyer);
  await addFromDetail(page, isbn);
  await page.goto("/carrito");
  await page.getByLabel("Cantidad de Libro con una sola unidad e2e").selectOption("2");
  await expect(page.getByRole("link", { name: /^Carrito, 2 libros/ })).toBeVisible();
  await goToCheckout(page);
  await fillAddress(page);
  await page.getByRole("button", { name: /^Pagar S\// }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toContainText("No hay suficientes unidades de uno de tus libros.");
  await expect(alert).toContainText("No se te cobró nada.");
  await expect(alert.getByRole("link", { name: "Volver al carrito" })).toBeVisible();
  expect(await ordersOf(buyer)).toHaveLength(0);
});

test("un corte de red tras crearse el pedido: «Reintentar» no cobra dos veces", async ({
  page,
}) => {
  await addStock(SEEDED.clean, 20);
  const buyer = await createBuyer();
  await signIn(page, buyer);
  await addFromDetail(page, SEEDED.clean);
  await goToCheckout(page);
  await fillAddress(page);

  // La petición llega al backend y el pedido SE CREA, pero la respuesta no vuelve a la tienda (la conexión se corta)
  const keys: (string | null)[] = [];
  let dropped = false;
  await page.route("**/api/orders", async (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.continue();
    keys.push(request.headers()["idempotency-key"] ?? null);
    if (dropped) return route.continue();
    dropped = true;
    await route.fetch();
    await route.abort("connectionreset");
  });

  await page.getByRole("button", { name: /^Pagar S\// }).click();
  await expect(page.getByText("No pudimos confirmar tu pago.")).toBeVisible();
  // No se afirma que no se cobró: no se sabe
  await expect(page.getByRole("alert", { name: /cobr/i })).toHaveCount(0);
  expect(await ordersOf(buyer)).toHaveLength(1); // el pedido sí se creó

  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("heading", { name: "¡Gracias por tu compra!" })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]); // la misma clave de idempotencia
  const orders = await ordersOf(buyer);
  expect(orders).toHaveLength(1); // un solo pedido, un solo cobro
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orders[0]!.id}/gracias$`));
});

test("entrar con el formulario: una contraseña equivocada no entra y la correcta lleva al catálogo", async ({
  page,
}) => {
  const buyer = await createBuyer();
  await page.goto("/ingresar");
  await page.getByLabel("Correo electrónico", { exact: true }).fill(buyer.email);
  await page.getByLabel("Contraseña", { exact: true }).fill("una contraseña equivocada");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entra a tu cuenta" })).toBeVisible();
  await page.getByLabel("Contraseña", { exact: true }).fill(buyer.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Libros", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mi cuenta" })).toBeVisible();
});

test("un pedido ajeno no se ve: la API y la tienda dicen que no existe", async ({ page }) => {
  await addStock(SEEDED.clean, 20);
  const owner = await createBuyer();
  const other = await createBuyer();
  const { orderId } = await (async () => {
    const { body } = await call("/orders", {
      method: "POST",
      token: owner.accessToken,
      key: crypto.randomUUID(),
      body: {
        cardToken: "tok_visa",
        items: [{ isbn: SEEDED.clean, quantity: 1 }],
        shippingAddress: {
          recipient: "Ana",
          phone: "+51 999 999 999",
          line1: "Jr. Ucayali 150",
          district: "Barranco",
          province: "Lima",
          department: "Lima",
        },
      },
    });
    return body as { orderId: string };
  })();
  await signIn(page, other);
  await page.goto(`/pedidos/${orderId}`);
  await expect(page.getByRole("heading", { name: "No encontramos este pedido." })).toBeVisible();
  await expect(page.getByText("Ana")).toHaveCount(0);
});

test("el build de producción no ofrece tarjetas de prueba; el de desarrollo sí", async ({
  page,
}) => {
  await addStock(SEEDED.clean, 20);
  await signIn(page, await createBuyer());
  await addFromDetail(page, SEEDED.clean);
  await goToCheckout(page);
  await expect(page.getByLabel("Tarjeta de prueba")).toHaveCount(PRODUCTION_BUILD ? 0 : 1);
});
