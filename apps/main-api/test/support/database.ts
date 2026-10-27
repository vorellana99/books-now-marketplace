import { Client } from 'pg';

// Solo el globalSetup de los tests de integración (que levanta un contenedor propio) marca esta variable.
// Impide que un vaciado de tablas llegue por error a la base de desarrollo
export function assertIsolatedDatabase(): void {
  if (process.env.INTEGRATION_DB_CONTAINER !== '1') {
    throw new Error(
      'Esta operación borra datos y solo se permite sobre el contenedor de pruebas ' +
        '(pnpm run test:e2e). La base configurada en DB_* no es ese contenedor.',
    );
  }
}

// Una conexión por consulta: simple y sin conexiones abiertas que cerrar al terminar el test
export async function query<T extends object = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    await client.end();
  }
}

const APP_SCHEMAS = ['sales', 'catalog', 'inventory', 'messaging'];

// Vacía los datos de los cuatro schemas y conserva las tablas y el historial de migraciones
export async function resetDatabase(): Promise<void> {
  assertIsolatedDatabase();
  await removeSlowStockUpdates(); // por si un test falló antes de quitar el retardo
  const tables = await query<{ name: string }>(
    `SELECT quote_ident(schemaname) || '.' || quote_ident(tablename) AS name
     FROM pg_tables WHERE schemaname = ANY($1)`,
    [APP_SCHEMAS],
  );
  if (tables.length > 0) {
    await query(
      `TRUNCATE ${tables.map((t) => t.name).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

// Hace que cada actualización de una fila de stock tarde `milliseconds`, para ampliar la ventana en la que dos
// transacciones se cruzan. Sin esto, operaciones de milisegundos casi nunca coinciden y una prueba de interbloqueo
// pasaría aunque el código estuviera mal. Devuelve la función que lo quita
export async function slowDownStockUpdates(
  milliseconds: number,
): Promise<() => Promise<void>> {
  assertIsolatedDatabase();
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    throw new Error('milliseconds inválido');
  await query(`
    CREATE OR REPLACE FUNCTION inventory.test_slow_update() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_sleep(${milliseconds / 1000}); RETURN NEW; END $$`);
  await query(`
    CREATE OR REPLACE TRIGGER test_slow_update BEFORE UPDATE ON inventory.stock_items
    FOR EACH ROW EXECUTE FUNCTION inventory.test_slow_update()`);
  return removeSlowStockUpdates;
}

export async function removeSlowStockUpdates(): Promise<void> {
  assertIsolatedDatabase();
  await query(
    'DROP TRIGGER IF EXISTS test_slow_update ON inventory.stock_items',
  );
  await query('DROP FUNCTION IF EXISTS inventory.test_slow_update()');
}
