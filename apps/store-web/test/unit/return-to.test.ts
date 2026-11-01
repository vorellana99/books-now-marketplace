import { describe, expect, it } from "vite-plus/test";
import { safeReturnTo } from "@/features/auth/return-to.ts";

// `returnTo` guarda solo una ruta interna: cualquier otro valor se ignora, para que nadie pueda armar un enlace de ingreso
// que, al entrar, lleve a un sitio ajeno
describe("safeReturnTo", () => {
  it.each([
    "/carrito",
    "/libros/9780132350884",
    "/pedidos/abc/gracias",
    "/?q=clean&page=2",
    "/compra#pago",
  ])("acepta la ruta interna %s", (path) => {
    expect(safeReturnTo(path)).toBe(path);
  });

  it.each([
    ["//otro.com", "dos barras: el navegador lo toma por otro sitio"],
    ["//otro.com/carrito", "dos barras con ruta"],
    ["https://otro.com", "una URL absoluta"],
    ["http://otro.com/carrito", "una URL absoluta"],
    ["javascript:alert(1)", "un esquema de código"],
    ["/\\otro.com", "barra y contrabarra: algunos navegadores la toman por //"],
    ["\\\\otro.com", "dos contrabarras"],
    ["carrito", "sin la barra inicial"],
    ["", "vacío"],
    ["  /carrito", "espacios antes: no es lo que parece"],
    ["/carrito\nSet-Cookie: x=1", "un salto de línea"],
    ["/\tcarrito", "un carácter de control"],
  ])("ignora %j (%s)", (value) => {
    expect(safeReturnTo(value)).toBeUndefined();
  });

  it.each([undefined, null, 42, {}, ["/carrito"], true])(
    "ignora lo que no es texto (%j)",
    (value) => {
      expect(safeReturnTo(value)).toBeUndefined();
    },
  );

  it("ignora una ruta absurdamente larga", () => {
    expect(safeReturnTo(`/${"a".repeat(600)}`)).toBeUndefined();
  });

  it("no vuelve a las pantallas de entrada: sería un bucle", () => {
    expect(safeReturnTo("/ingresar")).toBeUndefined();
    expect(safeReturnTo("/registro")).toBeUndefined();
    expect(safeReturnTo("/ingresar?returnTo=/carrito")).toBeUndefined();
  });
});
