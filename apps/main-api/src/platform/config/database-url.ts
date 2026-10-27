// Sin dependencias de Nest ni de zod: también lo importa `prisma.config.ts`.
const REQUIRED = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;

type DbEnv = Record<string, string | number | undefined>;

/** Arma la URL de PostgreSQL a partir de las variables `DB_*`, codificando usuario y contraseña. */
export function buildDatabaseUrl(env: DbEnv): string {
  const missing = REQUIRED.filter((k) => env[k] === undefined || env[k] === '');
  if (missing.length > 0) {
    throw new Error(`Faltan variables de base de datos: ${missing.join(', ')}`);
  }
  const user = encodeURIComponent(String(env.DB_USER));
  const password = encodeURIComponent(String(env.DB_PASSWORD));
  const port = env.DB_PORT || 5432;
  return `postgresql://${user}:${password}@${env.DB_HOST}:${port}/${env.DB_NAME}`;
}
