import { z } from 'zod';

// Un secreto de al menos 32 caracteres y con variedad: uno repetido ("xxxx…") o de plantilla no protege nada
const optionalSecret = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z
    .string()
    .min(32, 'debe tener al menos 32 caracteres')
    .refine((v) => new Set(v).size >= 12, 'tiene poca variedad de caracteres')
    .optional(),
);

// Una lista de orígenes permitidos por CORS, separados por comas. Cada uno es esquema://host[:puerto], sin ruta, barra
// final, consulta, fragmento ni credenciales, y sin comodines: se normaliza (minúsculas, sin el puerto por defecto) y se
// quitan los repetidos. Vacía, no hay CORS
// Un plazo de retención en días: entre 1 y 10 años
const retentionDays = (defaultDays: number) =>
  z.coerce.number().int().min(1).max(3650).default(defaultDays);

const MAX_CORS_ORIGINS = 20;
const ORIGIN_SHAPE = /^https?:\/\/[^/?#@\s]+$/i;
const corsOrigins = z
  .string()
  .default('')
  .transform((raw, ctx) => {
    const origins = new Set<string>();
    for (const item of raw.split(',').map((o) => o.trim())) {
      if (item === '') continue;
      let origin: string | undefined;
      if (ORIGIN_SHAPE.test(item)) {
        try {
          origin = new URL(item).origin;
        } catch {
          origin = undefined; // por ejemplo, un puerto fuera de rango
        }
      }
      if (origin === undefined || origin === 'null') {
        ctx.addIssue({
          code: 'custom',
          message: `"${item}" no es un origen válido: use esquema://host[:puerto], sin ruta ni comodines`,
        });
        return z.NEVER;
      }
      origins.add(origin);
    }
    if (origins.size > MAX_CORS_ORIGINS) {
      ctx.addIssue({
        code: 'custom',
        message: `como máximo ${MAX_CORS_ORIGINS} orígenes`,
      });
      return z.NEVER;
    }
    return [...origins];
  });

const rateLimit = (fallback: number) =>
  z.coerce.number().int().min(1).max(100_000).default(fallback);

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
    // Secreto con el que se firman los tokens de acceso. Obligatorio en producción; sin él, fuera de producción, la
    // aplicación usa uno aleatorio por proceso (los tokens dejan de valer al reiniciar)
    JWT_SECRET: optionalSecret,
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    // Cuántos días vale un token de refresco sin usarse. Cada uso entrega uno nuevo con su plazo completo
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    // Orígenes que pueden llamar a la API desde un navegador (CORS). Vacía por defecto: sin CORS. En producción, solo https
    CORS_ORIGINS: corsOrigins,
    // Cuántos proxies hay delante de la API (0 = ninguno). De ahí sale la dirección del cliente para el límite de intentos:
    // con un valor de más se podría falsificar con X-Forwarded-For, y con uno de menos todos compartirían la del proxy
    TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
    // Límite de intentos, en memoria y por ventana. El de login se aplica por dirección y por cuenta
    RATE_LIMIT_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(3600)
      .default(60),
    RATE_LIMIT_LOGIN_IP: rateLimit(20),
    RATE_LIMIT_LOGIN_ACCOUNT: rateLimit(5),
    RATE_LIMIT_REGISTER_IP: rateLimit(10),
    RATE_LIMIT_REFRESH_IP: rateLimit(30), // también el cierre de sesión
    // Costo (log2 de N) del hash de contraseñas con scrypt. Los tests lo bajan; en producción no puede ser menor que 15
    PASSWORD_HASH_LOG_N: z.coerce.number().int().min(4).max(20).default(15),
    EMAIL_SIMULATED_DELAY_MS: z.coerce.number().int().min(0).default(3000), // lo que tarda el correo simulado
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(8),
    CHECKOUT_RECOVERY_MINUTES: z.coerce.number().int().min(2).default(10),
    // Cuántos días se guardan los datos ya terminados antes de purgarlos (cada noche, a las 3). Lo pendiente, en curso o
    // fallido nunca se purga. Ojo: purgar un checkout olvida su Idempotency-Key, así que su plazo debe superar cualquier
    // reintento razonable del cliente
    RETENTION_OUTBOX_DAYS: retentionDays(30), // mensajes del outbox con todas sus entregas hechas
    RETENTION_CHECKOUT_DAYS: retentionDays(30), // checkouts COMPLETED o ABORTED
    RETENTION_RESERVATION_DAYS: retentionDays(90), // reservas CONFIRMED
    RETENTION_REFRESH_TOKEN_DAYS: retentionDays(7), // tokens de refresco, tras vencer, usarse o revocarse
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
  })
  // En producción los navegadores solo deben hablar con la API por https
  .refine(
    (e) =>
      !(
        e.NODE_ENV === 'production' &&
        e.CORS_ORIGINS.some((o) => !o.startsWith('https://'))
      ),
    {
      path: ['CORS_ORIGINS'],
      message: 'En producción CORS_ORIGINS solo admite orígenes https',
    },
  )
  // La pasarela simulada aprueba cualquier tarjeta: en producción hay que elegir un proveedor de verdad
  .refine(
    (e) => !(e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'fake'),
    {
      path: ['PAYMENT_PROVIDER'],
      message:
        'PAYMENT_PROVIDER=fake aprueba cualquier tarjeta y no puede usarse en producción: configura PAYMENT_PROVIDER=external y PAYMENT_API_URL',
    },
  )
  .refine((e) => !(e.NODE_ENV === 'production' && !e.JWT_SECRET), {
    path: ['JWT_SECRET'],
    message:
      'JWT_SECRET es obligatorio en producción: genera uno con `openssl rand -base64 48`',
  })
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
