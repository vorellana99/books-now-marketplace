import { execFileSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';

// Misma versión que en desarrollo y en producción: el Outbox usa uuidv7(), que no existe antes
const IMAGE = 'postgres:18';

function dockerHelp(cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : String(cause);
  return [
    'No se pudo iniciar PostgreSQL en un contenedor para los tests de integración.',
    'Comprueba que Docker esté en marcha (prueba con: docker info).',
    'Solo `pnpm run test:e2e` lo necesita; `pnpm test` (unitarios) funciona sin Docker.',
    `Detalle: ${detail}`,
  ].join('\n');
}

// Se ejecuta una vez antes de todos los archivos de integración y e2e, y la función devuelta, una vez al final
export default async function setup(): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer;
  try {
    container = await new PostgreSqlContainer(IMAGE)
      .withDatabase('libroya_test')
      .withUsername('libroya')
      .withPassword('libroya')
      .start();
  } catch (error) {
    throw new Error(dockerHelp(error));
  }

  // Los workers de Vitest se crean después y heredan estas variables, que tienen prioridad sobre .env
  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = String(container.getPort());
  process.env.DB_USER = container.getUsername();
  process.env.DB_PASSWORD = container.getPassword();
  process.env.DB_NAME = container.getDatabase();
  process.env.INTEGRATION_DB_CONTAINER = '1';
  // Los proveedores simulados tardan 3 s en desarrollo; los tests no deben esperarlos
  process.env.PAYMENT_SIMULATED_DELAY_MS = '0';
  process.env.EMAIL_SIMULATED_DELAY_MS = '0';

  try {
    // El mismo comando que usa producción, sobre una base vacía
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      env: process.env,
      stdio: 'pipe',
    });
  } catch (error) {
    await container.stop();
    const output = (
      error as { stdout?: Buffer; stderr?: Buffer }
    ).stderr?.toString();
    throw new Error(
      `Fallaron las migraciones en el contenedor de pruebas:\n${output ?? String(error)}`,
    );
  }

  return async () => {
    await container.stop();
  };
}
