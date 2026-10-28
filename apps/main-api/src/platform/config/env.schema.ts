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
    PAYMENT_SIMULATED_DELAY_MS: z.coerce.number().int().min(0).default(3000), // solo con PAYMENT_PROVIDER=fake
    // Costo (log2 de N) del hash de contraseñas con scrypt. Los tests lo bajan; en producción no puede ser menor que 15
    PASSWORD_HASH_LOG_N: z.coerce.number().int().min(4).max(20).default(15),
    EMAIL_SIMULATED_DELAY_MS: z.coerce.number().int().min(0).default(3000), // lo que tarda el correo simulado
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
  // La pasarela simulada aprueba cualquier tarjeta: en producción hay que elegir un proveedor de verdad
  .refine(
    (e) => !(e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'fake'),
    {
      path: ['PAYMENT_PROVIDER'],
      message:
        'PAYMENT_PROVIDER=fake aprueba cualquier tarjeta y no puede usarse en producción: configura PAYMENT_PROVIDER=external y PAYMENT_API_URL',
    },
  )
  // Un costo bajo debilitaría todos los hashes de contraseña: solo es para desarrollo y tests
  .refine((e) => !(e.NODE_ENV === 'production' && e.PASSWORD_HASH_LOG_N < 15), {
    path: ['PASSWORD_HASH_LOG_N'],
    message: 'PASSWORD_HASH_LOG_N no puede ser menor que 15 en producción',
  })
  .refine(
    (e) => e.PAYMENT_PROVIDER !== 'external' || Boolean(e.PAYMENT_API_URL),
    {
      path: ['PAYMENT_API_URL'],
      message: 'PAYMENT_API_URL es obligatoria con PAYMENT_PROVIDER=external',
    },
  );

export type Env = z.infer<typeof envSchema>;
