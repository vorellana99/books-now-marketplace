// Opciones que se fijan en cada conexión de la aplicación con PostgreSQL.
//  - timezone=UTC: las columnas TIMESTAMP no llevan zona horaria. Prisma rellena @default(now()) en UTC desde el
//    cliente y el relay del Outbox compara con now() de la base: si la sesión usara la zona de la base (UTC−5, por
//    ejemplo), las entregas nuevas quedarían programadas horas en el futuro
//  - statement_timeout: ninguna sentencia puede quedarse esperando indefinidamente (un bloqueo, una consulta
//    lenta). Mantiene acotada la duración de la saga, de la que depende el umbral del job de recuperación
export function connectionOptions(statementTimeoutMs: number): string {
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1) {
    throw new Error(
      `DB_STATEMENT_TIMEOUT_MS debe ser un entero positivo, y llegó ${statementTimeoutMs}`,
    );
  }
  return `-c timezone=UTC -c statement_timeout=${statementTimeoutMs}`;
}
