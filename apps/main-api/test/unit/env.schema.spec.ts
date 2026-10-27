import { envSchema } from '../../src/platform/config/env.schema.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('envSchema', () => {
  it('aplica los valores por defecto y convierte los tipos', () => {
    const env = envSchema.parse({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.PAYMENT_PROVIDER).toBe('fake');
    expect(env.OUTBOX_MAX_ATTEMPTS).toBe(8);
    expect(env.CHECKOUT_RECOVERY_MINUTES).toBe(10);
    expect(env.ADMIN_API_ENABLED).toBe(false);
  });

  it('acepta PAYMENT_API_URL vacía con el proveedor fake', () => {
    expect(
      envSchema.parse({ ...base, PAYMENT_API_URL: '' }).PAYMENT_API_URL,
    ).toBeUndefined();
  });

  it('exige PAYMENT_API_URL con PAYMENT_PROVIDER=external', () => {
    expect(() =>
      envSchema.parse({ ...base, PAYMENT_PROVIDER: 'external' }),
    ).toThrow(/PAYMENT_API_URL/);
  });

  it('rechaza ADMIN_API_ENABLED en producción', () => {
    expect(() =>
      envSchema.parse({
        ...base,
        NODE_ENV: 'production',
        ADMIN_API_ENABLED: 'true',
      }),
    ).toThrow(/ADMIN_API_ENABLED/);
  });

  it('falla sin DATABASE_URL', () => {
    expect(() => envSchema.parse({})).toThrow(/DATABASE_URL/);
  });

  it('exige que CHECKOUT_RECOVERY_MINUTES sea al menos 2', () => {
    expect(() =>
      envSchema.parse({ ...base, CHECKOUT_RECOVERY_MINUTES: '1' }),
    ).toThrow();
  });
});
