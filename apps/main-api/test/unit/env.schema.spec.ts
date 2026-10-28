import { envSchema } from '../../src/platform/config/env.schema.js';

const base = {
  DB_HOST: 'localhost',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'db',
};

describe('envSchema', () => {
  it('aplica los valores por defecto y convierte los tipos', () => {
    const env = envSchema.parse({ ...base, PORT: '4000' });
    expect(env.PORT).toBe(4000);
    expect(env.PAYMENT_PROVIDER).toBe('fake');
    expect(env.OUTBOX_MAX_ATTEMPTS).toBe(8);
    expect(env.CHECKOUT_RECOVERY_MINUTES).toBe(10);
    expect(env.DB_STATEMENT_TIMEOUT_MS).toBe(5000);
    expect(env.ADMIN_API_ENABLED).toBe(false);
  });

  it('DB_STATEMENT_TIMEOUT_MS se convierte a número', () => {
    expect(
      envSchema.parse({ ...base, DB_STATEMENT_TIMEOUT_MS: '8000' })
        .DB_STATEMENT_TIMEOUT_MS,
    ).toBe(8000);
  });

  it.each(['0', '-5', '1.5', 'abc'])(
    'rechaza DB_STATEMENT_TIMEOUT_MS=%s',
    (value) => {
      expect(() =>
        envSchema.parse({ ...base, DB_STATEMENT_TIMEOUT_MS: value }),
      ).toThrow(/DB_STATEMENT_TIMEOUT_MS/);
    },
  );

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

  it('falla sin las variables de base de datos', () => {
    expect(() => envSchema.parse({})).toThrow(/DB_HOST/);
  });

  it('usa el puerto 5432 por defecto y convierte DB_PORT', () => {
    expect(envSchema.parse(base).DB_PORT).toBe(5432);
    expect(envSchema.parse({ ...base, DB_PORT: '5433' }).DB_PORT).toBe(5433);
  });

  it('exige que CHECKOUT_RECOVERY_MINUTES sea al menos 2', () => {
    expect(() =>
      envSchema.parse({ ...base, CHECKOUT_RECOVERY_MINUTES: '1' }),
    ).toThrow();
  });
});
