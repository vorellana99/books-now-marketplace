// Esperas que las pruebas acortan (`timing.newCustomerRetryMs = 5`) para no esperar de verdad
export const timing = {
  // Cada cuánto se vuelve a consultar un pago que sigue en curso (`CHECKOUT_IN_PROGRESS`), y cuántas veces antes de decir
  // que no se pudo confirmar. La pasarela simulada tarda unos 3 s
  pollMs: 3000,
  maxPolls: 20,
  // Tras registrarse, el cliente de Ventas se crea en segundo plano: una compra o una cotización inmediata puede dar
  // `404 NOT_FOUND` aunque todo esté bien (HU-31). Se reintenta cada par de segundos, hasta 4 veces (unos 8 s): el Outbox
  // entrega 10 eventos por segundo por instancia y con una ráfaga de registros el cliente puede tardar más que un solo
  // reintento (las pruebas e2e lo vieron: 2 s no alcanzaron)
  newCustomerRetryMs: 2000,
  newCustomerRetries: 4,
};
