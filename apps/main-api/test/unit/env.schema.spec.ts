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

  describe('la pasarela simulada no llega a producción', () => {
    const production = { ...base, NODE_ENV: 'production' };

    it('rechaza PAYMENT_PROVIDER=fake con NODE_ENV=production', () => {
      expect(() =>
        envSchema.parse({ ...production, PAYMENT_PROVIDER: 'fake' }),
      ).toThrow(/PAYMENT_PROVIDER/);
    });

    it('también cuando no se define: el valor por defecto es fake', () => {
      expect(() => envSchema.parse(production)).toThrow(/PAYMENT_PROVIDER/);
    });

    it('el error señala la variable PAYMENT_PROVIDER', () => {
      const result = envSchema.safeParse(production);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((i) => i.path.join('.'))).toContain(
        'PAYMENT_PROVIDER',
      );
    });

    it('el mensaje dice qué hacer', () => {
      expect(() => envSchema.parse(production)).toThrow(/external/);
    });

    it('acepta external con su URL en producción', () => {
      const env = envSchema.parse({
        ...production,
        PAYMENT_PROVIDER: 'external',
        PAYMENT_API_URL: 'https://pagos.example.com',
      });
      expect(env.PAYMENT_PROVIDER).toBe('external');
    });

    it.each(['development', 'test'])(
      'fake sigue permitido con NODE_ENV=%s',
      (nodeEnv) => {
        expect(
          envSchema.parse({
            ...base,
            NODE_ENV: nodeEnv,
            PAYMENT_PROVIDER: 'fake',
          }).PAYMENT_PROVIDER,
        ).toBe('fake');
      },
    );

    it('sin NODE_ENV (desarrollo por defecto) también', () => {
      expect(envSchema.parse(base).PAYMENT_PROVIDER).toBe('fake');
    });

    it('external sin URL en producción pide la URL, no solo cambiar de proveedor', () => {
      expect(() =>
        envSchema.parse({ ...production, PAYMENT_PROVIDER: 'external' }),
      ).toThrow(/PAYMENT_API_URL/);
    });
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
