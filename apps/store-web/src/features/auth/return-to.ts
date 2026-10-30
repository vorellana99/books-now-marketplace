// `returnTo` es la ruta a la que volver tras entrar. Guarda solo una ruta interna: empieza por `/` y no por `//`, sin
// contrabarras ni caracteres de control. Cualquier otro valor se ignora, para que nadie pueda armar un enlace de ingreso
// que, al entrar, lleve a un sitio ajeno
const MAX_LENGTH = 500;
const hasControlChars = (text: string): boolean => {
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
};
// Las pantallas de entrada no sirven de destino: llevarían de vuelta a donde ya se está
const ENTRY_ROUTES = /^\/(ingresar|registro)(?:[/?#]|$)/;

export function safeReturnTo(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (value.length === 0 || value.length > MAX_LENGTH) return undefined;
  if (!value.startsWith("/") || value.startsWith("//")) return undefined;
  if (value.includes("\\") || hasControlChars(value)) return undefined;
  if (ENTRY_ROUTES.test(value)) return undefined;
  return value;
}
