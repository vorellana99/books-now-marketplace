import {
  RECOVERY_BATCH,
  RECOVERY_LOCK_MINUTES,
} from '../../src/contexts/sales/domain/order/checkout-log.port.js';
import { PAYMENT_TIMEOUT_MS } from '../../src/contexts/sales/infrastructure/adapters/external-payment.adapter.js';
import { envSchema } from '../../src/platform/config/env.schema.js';
import { BATCH, LEASE_MS } from '../../src/platform/outbox/outbox.relay.js';

// Con los valores por defecto, los proveedores simulados tardan 3 s por operación. Estos tests comprueban que los
// márgenes que asumen el relay y el job de recuperación se siguen cumpliendo con esa demora: si alguien sube un
// valor por defecto, el fallo dice qué margen se rompe
const defaults = envSchema.parse({
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'db',
});
const PAYMENT = defaults.PAYMENT_SIMULATED_DELAY_MS;
const EMAIL = defaults.EMAIL_SIMULATED_DELAY_MS;
const STATEMENT = defaults.DB_STATEMENT_TIMEOUT_MS;
const MIN_RECOVERY_THRESHOLD_MS = 2 * 60_000; // CHECKOUT_RECOVERY_MINUTES admite como mínimo 2
const RELEASE_MS = 5_000; // una liberación de stock, en el peor caso: una sentencia con su límite

describe('márgenes con la demora por defecto de los proveedores simulados', () => {
  it('por defecto la pasarela y el correo tardan 3 segundos', () => {
    expect(PAYMENT).toBe(3000);
    expect(EMAIL).toBe(3000);
  });

  it('un correo no tarda más de los 10 s por entrega que supone el relay', () => {
    expect(EMAIL).toBeLessThanOrEqual(10_000);
  });

  it('una vuelta completa del relay (BATCH correos seguidos) cabe dentro del bloqueo de las entregas', () => {
    expect(BATCH * EMAIL).toBeLessThan(LEASE_MS);
  });

  it('la pasarela simulada nunca tarda más de lo que ya acota el timeout del adaptador externo', () => {
    expect(PAYMENT).toBeLessThanOrEqual(PAYMENT_TIMEOUT_MS);
  });

  it('el job de recuperación termina un lote (reembolso lento + liberación) antes de que venza su bloqueo', () => {
    const lockMs = RECOVERY_LOCK_MINUTES * 60_000;
    expect(RECOVERY_BATCH * (PAYMENT + RELEASE_MS)).toBeLessThan(lockMs);
  });

  it('una compra fallida en el peor punto (cobro, reembolso y compensaciones) dura menos que el umbral mínimo de recuperación', () => {
    // reserva + cobro lento + reembolso lento + liberación + anulación, cada sentencia con su límite
    const worst = PAYMENT + PAYMENT + 3 * STATEMENT;
    expect(worst).toBeLessThan(MIN_RECOVERY_THRESHOLD_MS);
  });
});
