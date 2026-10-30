// Esperas que las pruebas acortan (`timing.newCustomerRetryMs = 5`) para no esperar de verdad
export const timing = {
  // Tras registrarse, el cliente de Ventas se crea en segundo plano: una compra o una cotización inmediata puede dar
  // `404 NOT_FOUND` aunque todo esté bien (HU-31). Se reintenta una vez tras un par de segundos
  newCustomerRetryMs: 2000,
};
