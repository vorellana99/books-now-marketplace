import type { Logger } from '@nestjs/common';

// Cuántas filas borra cada lote y cuántos lotes como mucho en una vuelta: la purga nunca retiene muchas filas bloqueadas
// a la vez ni se queda horas en un backlog; lo que sobre lo borra la vuelta de la noche siguiente
export const PURGE_BATCH = 1000;
export const PURGE_MAX_BATCHES = 100;

interface BatchOptions {
  batch?: number;
  maxBatches?: number;
}

// Repite `deleteBatch(limit)` hasta que un lote sale incompleto (ya no queda más) o llega al máximo de lotes. Devuelve
// cuántas filas borró en total
export async function purgeInBatches(
  deleteBatch: (limit: number) => Promise<number>,
  { batch = PURGE_BATCH, maxBatches = PURGE_MAX_BATCHES }: BatchOptions = {},
): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const deleted = await deleteBatch(batch);
    total += deleted;
    if (deleted < batch) break;
  }
  return total;
}

// Lo que hace cada job de purga: borra por lotes y lo anota. Un error no sale hacia el cron (el siguiente día lo
// reintenta); queda en el log con lo que alcanzó a borrar
export async function runPurge(
  logger: Logger,
  what: string,
  days: number,
  deleteBatch: (limit: number) => Promise<number>,
): Promise<number> {
  let total = 0;
  try {
    await purgeInBatches(async (limit) => {
      const deleted = await deleteBatch(limit);
      total += deleted;
      return deleted;
    });
  } catch (error) {
    logger.error(
      `No se pudo terminar la purga de ${what} (borradas ${total}): ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (total > 0) {
    logger.log(`Purga de ${what}: ${total} filas con más de ${days} días`);
  }
  return total;
}
