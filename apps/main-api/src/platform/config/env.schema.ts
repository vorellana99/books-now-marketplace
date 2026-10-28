import { z } from 'zod';

const optionalUrl = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.url().optional(),
); // `PAYMENT_API_URL=` vacío

export const envSchema = z
  .looseObject({
    // deja pasar el resto de variables del proceso
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().default(5432),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    PORT: z.coerce.number().int().default(3000),
    PAYMENT_PROVIDER: z.enum(['fake', 'external']).default('fake'),
    PAYMENT_API_URL: optionalUrl,
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(8),
    CHECKOUT_RECOVERY_MINUTES: z.coerce.number().int().min(2).default(10),
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    ADMIN_API_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.ADMIN_API_ENABLED), {
    path: ['ADMIN_API_ENABLED'],
    message:
      'Los endpoints /admin no pueden habilitarse en producción sin autenticación',
  })
  .refine(
    (e) => e.PAYMENT_PROVIDER !== 'external' || Boolean(e.PAYMENT_API_URL),
    {
      path: ['PAYMENT_API_URL'],
      message: 'PAYMENT_API_URL es obligatoria con PAYMENT_PROVIDER=external',
    },
  );

export type Env = z.infer<typeof envSchema>;
