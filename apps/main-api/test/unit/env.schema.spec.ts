import { envSchema } from '../../src/platform/config/env.schema.js';

// Un secreto de tokens válido, para los entornos de producción de estos tests
const SECRET = 'k3Jx9QmZ2vLp7RtYw4NcB8dFh5GsA1eU6oIy0TnX';

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
    expect(env.PAYMENT_SIMULATED_DELAY_MS).toBe(3000);
    expect(env.EMAIL_SIMULATED_DELAY_MS).toBe(3000);
    expect(env).not.toHaveProperty('ADMIN_API_ENABLED'); // la administración se protege con el rol, no con una variable
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

  describe('PAYMENT_SIMULATED_DELAY_MS', () => {
    it('se convierte a número y admite 0 para desactivar la demora', () => {
      expect(
        envSchema.parse({ ...base, PAYMENT_SIMULATED_DELAY_MS: '0' })
          .PAYMENT_SIMULATED_DELAY_MS,
      ).toBe(0);
      expect(
        envSchema.parse({ ...base, PAYMENT_SIMULATED_DELAY_MS: '1500' })
          .PAYMENT_SIMULATED_DELAY_MS,
      ).toBe(1500);
    });

    it.each(['-1', '1.5', 'abc'])('rechaza %s', (value) => {
      expect(() =>
        envSchema.parse({ ...base, PAYMENT_SIMULATED_DELAY_MS: value }),
      ).toThrow(/PAYMENT_SIMULATED_DELAY_MS/);
    });
  });

  describe('EMAIL_SIMULATED_DELAY_MS', () => {
    it('se convierte a número y admite 0 para desactivar la demora', () => {
      expect(
        envSchema.parse({ ...base, EMAIL_SIMULATED_DELAY_MS: '0' })
          .EMAIL_SIMULATED_DELAY_MS,
      ).toBe(0);
      expect(
        envSchema.parse({ ...base, EMAIL_SIMULATED_DELAY_MS: '2500' })
          .EMAIL_SIMULATED_DELAY_MS,
      ).toBe(2500);
    });

    it.each(['-1', '1.5', 'abc'])('rechaza %s', (value) => {
      expect(() =>
        envSchema.parse({ ...base, EMAIL_SIMULATED_DELAY_MS: value }),
      ).toThrow(/EMAIL_SIMULATED_DELAY_MS/);
    });
  });

  describe('PASSWORD_HASH_LOG_N: el costo del hash de contraseñas', () => {
    it('por defecto es 15 (N = 32768), el valor seguro', () => {
      expect(envSchema.parse(base).PASSWORD_HASH_LOG_N).toBe(15);
    });

    it('se convierte a número y admite valores bajos fuera de producción, para que los tests no esperen', () => {
      expect(
        envSchema.parse({ ...base, PASSWORD_HASH_LOG_N: '4' })
          .PASSWORD_HASH_LOG_N,
      ).toBe(4);
      expect(
        envSchema.parse({ ...base, NODE_ENV: 'test', PASSWORD_HASH_LOG_N: '4' })
          .PASSWORD_HASH_LOG_N,
      ).toBe(4);
    });

    it.each(['3', '21', '4.5', 'abc', ''])('rechaza %j', (value) => {
      expect(() =>
        envSchema.parse({ ...base, PASSWORD_HASH_LOG_N: value }),
      ).toThrow(/PASSWORD_HASH_LOG_N/);
    });

    it('en producción no admite menos de 15: un costo bajo debilitaría todos los hashes', () => {
      const production = {
        ...base,
        NODE_ENV: 'production',
        PAYMENT_PROVIDER: 'external',
        PAYMENT_API_URL: 'https://pagos.example.com',
        JWT_SECRET: SECRET,
      };
      expect(() =>
        envSchema.parse({ ...production, PASSWORD_HASH_LOG_N: '14' }),
      ).toThrow(/PASSWORD_HASH_LOG_N/);
      expect(
        envSchema.parse({ ...production, PASSWORD_HASH_LOG_N: '15' })
          .PASSWORD_HASH_LOG_N,
      ).toBe(15);
      expect(
        envSchema.parse({ ...production, PASSWORD_HASH_LOG_N: '17' })
          .PASSWORD_HASH_LOG_N,
      ).toBe(17);
    });
  });

  describe('JWT_SECRET y la duración del token de acceso', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'external',
      PAYMENT_API_URL: 'https://pagos.example.com',
    };
    const GOOD = 'k3Jx9QmZ2vLp7RtYw4NcB8dFh5GsA1eU6oIy0TnX';

    it('puede faltar fuera de producción (la aplicación usa un secreto aleatorio por proceso)', () => {
      expect(envSchema.parse(base).JWT_SECRET).toBeUndefined();
      expect(
        envSchema.parse({ ...base, JWT_SECRET: '' }).JWT_SECRET,
      ).toBeUndefined();
    });

    it('en producción es obligatorio', () => {
      expect(() => envSchema.parse(production)).toThrow(/JWT_SECRET/);
      expect(() => envSchema.parse({ ...production, JWT_SECRET: '' })).toThrow(
        /JWT_SECRET/,
      );
      expect(
        envSchema.parse({ ...production, JWT_SECRET: GOOD }).JWT_SECRET,
      ).toBe(GOOD);
    });

    it.each(['corto', 'abcdefghijklmnopqrstuvwxyz01234'])(
      'de menos de 32 caracteres se rechaza, también fuera de producción (%j)',
      (secret) => {
        expect(() => envSchema.parse({ ...base, JWT_SECRET: secret })).toThrow(
          /JWT_SECRET/,
        );
        expect(() =>
          envSchema.parse({ ...production, JWT_SECRET: secret }),
        ).toThrow(/JWT_SECRET/);
      },
    );

    it('acepta exactamente 32 caracteres variados', () => {
      expect(
        envSchema.parse({
          ...base,
          JWT_SECRET: 'abcdefghijklmnopqrstuvwxyz012345',
        }).JWT_SECRET,
      ).toHaveLength(32);
    });

    it('acepta 12 caracteres distintos y rechaza 11', () => {
      expect(
        envSchema.parse({ ...base, JWT_SECRET: 'abcdefghijkl'.repeat(3) })
          .JWT_SECRET,
      ).toBeDefined();
      expect(() =>
        envSchema.parse({ ...base, JWT_SECRET: 'abcdefghijk'.repeat(3) }),
      ).toThrow(/JWT_SECRET/);
    });

    it.each([
      'x'.repeat(40),
      'abababababababababababababababababababab',
      'cambia-esto-cambia-esto-cambia-esto',
    ])(
      'un secreto de poca variedad de caracteres se rechaza (%j)',
      (secret) => {
        expect(() => envSchema.parse({ ...base, JWT_SECRET: secret })).toThrow(
          /JWT_SECRET/,
        );
      },
    );

    it('la duración del token de refresco es de 14 días por defecto, de 1 a 90', () => {
      expect(envSchema.parse(base).REFRESH_TOKEN_TTL_DAYS).toBe(14);
      for (const days of ['1', '90']) {
        expect(
          envSchema.parse({ ...base, REFRESH_TOKEN_TTL_DAYS: days })
            .REFRESH_TOKEN_TTL_DAYS,
        ).toBe(Number(days));
      }
    });

    it.each(['0', '91', '1.5', 'abc', '-1'])(
      'rechaza una duración de refresco de %j días',
      (value) => {
        expect(() =>
          envSchema.parse({ ...base, REFRESH_TOKEN_TTL_DAYS: value }),
        ).toThrow(/REFRESH_TOKEN_TTL_DAYS/);
      },
    );

    it('la duración del token de acceso es de 900 segundos por defecto, de 60 a 3600', () => {
      expect(envSchema.parse(base).ACCESS_TOKEN_TTL_SECONDS).toBe(900);
      expect(
        envSchema.parse({ ...base, ACCESS_TOKEN_TTL_SECONDS: '60' })
          .ACCESS_TOKEN_TTL_SECONDS,
      ).toBe(60);
      expect(
        envSchema.parse({ ...base, ACCESS_TOKEN_TTL_SECONDS: '3600' })
          .ACCESS_TOKEN_TTL_SECONDS,
      ).toBe(3600);
    });

    it.each(['59', '3601', '1.5', 'abc', '-1'])(
      'rechaza una duración de %j',
      (value) => {
        expect(() =>
          envSchema.parse({ ...base, ACCESS_TOKEN_TTL_SECONDS: value }),
        ).toThrow(/ACCESS_TOKEN_TTL_SECONDS/);
      },
    );
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
        JWT_SECRET: SECRET,
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

  describe('CORS, proxy y límites de intentos', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      PAYMENT_PROVIDER: 'external',
      PAYMENT_API_URL: 'https://pagos.example.com',
      JWT_SECRET: SECRET,
    };

    describe('CORS_ORIGINS', () => {
      it('por defecto está vacía: sin CORS', () => {
        expect(envSchema.parse(base).CORS_ORIGINS).toEqual([]);
        expect(
          envSchema.parse({ ...base, CORS_ORIGINS: '' }).CORS_ORIGINS,
        ).toEqual([]);
        expect(
          envSchema.parse({ ...base, CORS_ORIGINS: ' , ,' }).CORS_ORIGINS,
        ).toEqual([]);
      });

      it('es una lista de orígenes separados por comas, sin espacios ni repetidos', () => {
        expect(
          envSchema.parse({
            ...base,
            CORS_ORIGINS:
              ' https://libroya.pe , http://localhost:5173,https://libroya.pe ,https://admin.libroya.pe:8443',
          }).CORS_ORIGINS,
        ).toEqual([
          'https://libroya.pe',
          'http://localhost:5173',
          'https://admin.libroya.pe:8443',
        ]);
      });

      it('el origen se guarda en minúsculas y sin el puerto por defecto', () => {
        expect(
          envSchema.parse({
            ...base,
            CORS_ORIGINS: 'HTTPS://LibroYa.PE,https://x.pe:443,http://y.pe:80',
          }).CORS_ORIGINS,
        ).toEqual(['https://libroya.pe', 'https://x.pe', 'http://y.pe']);
      });

      it.each([
        ['un comodín', '*'],
        ['un comodín entre otros', 'https://libroya.pe,*'],
        ['sin esquema', 'libroya.pe'],
        ['sin esquema y con puerto', 'localhost:5173'],
        ['con una ruta', 'https://libroya.pe/app'],
        ['con barra final', 'https://libroya.pe/'],
        ['con una consulta', 'https://libroya.pe?x=1'],
        ['con un fragmento', 'https://libroya.pe#a'],
        ['con credenciales', 'https://user:pass@libroya.pe'],
        ['con otro esquema', 'ftp://libroya.pe'],
        ['con esquema javascript', 'javascript:alert(1)'],
        ['con un puerto fuera de rango', 'https://libroya.pe:70000'],
        ['null', 'null'],
        ['con espacios dentro', 'https://libr oya.pe'],
      ])('rechaza un origen %s', (_why, value) => {
        expect(() => envSchema.parse({ ...base, CORS_ORIGINS: value })).toThrow(
          /CORS_ORIGINS/,
        );
      });

      it('admite hasta 20 orígenes y no más', () => {
        const origins = (n: number) =>
          Array.from({ length: n }, (_, i) => `https://o${i}.libroya.pe`).join(
            ',',
          );
        expect(
          envSchema.parse({ ...base, CORS_ORIGINS: origins(20) }).CORS_ORIGINS,
        ).toHaveLength(20);
        expect(() =>
          envSchema.parse({ ...base, CORS_ORIGINS: origins(21) }),
        ).toThrow(/CORS_ORIGINS/);
      });

      it('en producción solo admite https: ni siquiera localhost', () => {
        expect(
          envSchema.parse({ ...production, CORS_ORIGINS: 'https://libroya.pe' })
            .CORS_ORIGINS,
        ).toEqual(['https://libroya.pe']);
        expect(() =>
          envSchema.parse({ ...production, CORS_ORIGINS: 'http://libroya.pe' }),
        ).toThrow(/CORS_ORIGINS/);
        expect(() =>
          envSchema.parse({
            ...production,
            CORS_ORIGINS: 'https://libroya.pe,http://localhost:5173',
          }),
        ).toThrow(/CORS_ORIGINS/);
      });
    });

    describe('TRUST_PROXY', () => {
      it('por defecto es 0 saltos (no se confía en ningún proxy)', () => {
        expect(envSchema.parse(base).TRUST_PROXY).toBe(0);
      });

      it('acepta de 0 a 10 saltos', () => {
        expect(envSchema.parse({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(
          1,
        );
        expect(
          envSchema.parse({ ...base, TRUST_PROXY: '10' }).TRUST_PROXY,
        ).toBe(10);
      });

      it.each(['-1', '11', '1.5', 'si', 'true'])('rechaza %j', (value) => {
        expect(() => envSchema.parse({ ...base, TRUST_PROXY: value })).toThrow(
          /TRUST_PROXY/,
        );
      });
    });

    describe('límites de intentos', () => {
      it('tienen valores por defecto prudentes', () => {
        const env = envSchema.parse(base);
        expect(env.RATE_LIMIT_WINDOW_SECONDS).toBe(60);
        expect(env.RATE_LIMIT_LOGIN_IP).toBe(20);
        expect(env.RATE_LIMIT_LOGIN_ACCOUNT).toBe(5);
        expect(env.RATE_LIMIT_REGISTER_IP).toBe(10);
        expect(env.RATE_LIMIT_REFRESH_IP).toBe(30);
      });

      it.each([
        'RATE_LIMIT_LOGIN_IP',
        'RATE_LIMIT_LOGIN_ACCOUNT',
        'RATE_LIMIT_REGISTER_IP',
        'RATE_LIMIT_REFRESH_IP',
      ])('%s acepta de 1 a 100000', (name) => {
        expect(
          envSchema.parse({ ...base, [name]: '1' })[name as 'TRUST_PROXY'],
        ).toBe(1);
        expect(
          envSchema.parse({ ...base, [name]: '100000' })[name as 'TRUST_PROXY'],
        ).toBe(100000);
        for (const bad of ['0', '-1', '100001', '1.5', 'muchos']) {
          expect(() => envSchema.parse({ ...base, [name]: bad })).toThrow(
            new RegExp(name),
          );
        }
      });

      it('la ventana acepta de 1 a 3600 segundos', () => {
        expect(
          envSchema.parse({ ...base, RATE_LIMIT_WINDOW_SECONDS: '1' })
            .RATE_LIMIT_WINDOW_SECONDS,
        ).toBe(1);
        expect(
          envSchema.parse({ ...base, RATE_LIMIT_WINDOW_SECONDS: '3600' })
            .RATE_LIMIT_WINDOW_SECONDS,
        ).toBe(3600);
        for (const bad of ['0', '3601', '1.5', 'x']) {
          expect(() =>
            envSchema.parse({ ...base, RATE_LIMIT_WINDOW_SECONDS: bad }),
          ).toThrow(/RATE_LIMIT_WINDOW_SECONDS/);
        }
      });
    });
  });

  it('falla sin las variables de base de datos', () => {
    expect(() => envSchema.parse({})).toThrow(/DB_HOST/);
  });

  it('usa el puerto 5432 por defecto y convierte DB_PORT', () => {
    expect(envSchema.parse(base).DB_PORT).toBe(5432);
    expect(envSchema.parse({ ...base, DB_PORT: '5433' }).DB_PORT).toBe(5433);
  });

  describe('plazos de retención (purga de datos viejos)', () => {
    const VARS = [
      ['RETENTION_OUTBOX_DAYS', 30],
      ['RETENTION_CHECKOUT_DAYS', 30],
      ['RETENTION_RESERVATION_DAYS', 90],
      ['RETENTION_REFRESH_TOKEN_DAYS', 7],
    ] as const;

    it.each(VARS)('%s vale %i días por defecto', (name, days) => {
      expect(envSchema.parse(base)[name]).toBe(days);
    });

    it.each(VARS)('%s se convierte a número', (name) => {
      expect(envSchema.parse({ ...base, [name]: '45' })[name]).toBe(45);
    });

    it.each(VARS)(
      '%s acepta 1 y 3650 y rechaza 0, 3651 y lo que no es entero',
      (name) => {
        expect(envSchema.parse({ ...base, [name]: '1' })[name]).toBe(1);
        expect(envSchema.parse({ ...base, [name]: '3650' })[name]).toBe(3650);
        for (const bad of ['0', '-1', '3651', '1.5', 'abc']) {
          expect(() => envSchema.parse({ ...base, [name]: bad })).toThrow();
        }
      },
    );

    it.each(VARS)(
      '%s: el error de un valor inválido nombra la variable',
      (name) => {
        const result = envSchema.safeParse({ ...base, [name]: '0' });
        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).toContain(name);
      },
    );
  });

  it('exige que CHECKOUT_RECOVERY_MINUTES sea al menos 2', () => {
    expect(() =>
      envSchema.parse({ ...base, CHECKOUT_RECOVERY_MINUTES: '1' }),
    ).toThrow();
  });
});
