// Esperas que las pruebas acortan (`timing.newCustomerRetryMs = 5`) para no esperar de verdad
export const timing = {
  // Cada cuánto se vuelve a consultar un pago que sigue en curso (`CHECKOUT_IN_PROGRESS`), y cuántas veces antes de decir
  // que no se pudo confirmar. La pasarela simulada tarda unos 3 s
  pollMs: 3000,
  maxPolls: 20,
  // Tras registrarse, el cliente de Ventas se crea en segundo plano: una compra o una cotización inmediata puede dar
  // `404 NOT_FOUND` aunque todo esté bien (HU-31). Se reintenta una vez tras un par de segundos
  newCustomerRetryMs: 2000,
};
