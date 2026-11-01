---
name: nueva-migracion
description: Lista de comprobación para cambiar el esquema de la base de datos del backend (Prisma, migración SQL con CHECK, schemas por contexto, pruebas de integración). Úsalo al añadir tablas, columnas o restricciones.
---

# Un cambio de base de datos

1. **Esquema:** edita `apps/main-api/prisma/schema.prisma`. Hay **un schema de PostgreSQL por contexto** (`sales`, `catalog`, `inventory`, `identity`) más `messaging`; sin claves foráneas ni joins entre contextos (se refieren por id o ISBN). `@@schema("…")` y `@@map("…")` en cada modelo; columnas `@map("snake_case")`.
2. **La migración SQL:** guarda una copia del esquema anterior y genera el SQL **sin base de datos**: `pnpm exec prisma migrate diff --from-schema <copia> --to-schema prisma/schema.prisma --script`. Créala en `prisma/migrations/<AAAAMMDDHHMMSS>_nombre/migration.sql` con una marca de tiempo **posterior** a la última. Si prefieres, `pnpm exec prisma migrate dev` con la base de desarrollo levantada.
3. **Prisma no declara `CHECK`:** se añaden a mano al final del SQL (formato de un correo, un hash en hexadecimal, un vencimiento posterior a la creación). La base exige lo que el código ya garantiza, por si otra ruta escribe sin pasar por él.
4. **Genera el cliente:** `pnpm exec prisma generate` (lo hacen solas las órdenes `build` y `test`).
5. **Esquema nuevo:** añádelo a `APP_SCHEMAS` en `test/support/database.ts` para que `resetDatabase()` lo vacíe.
6. **Pruebas de integración** (`test/integration/`, base real con Testcontainers): que cada `CHECK` rechaza lo que debe, la unicidad, la cascada al borrar, los valores por defecto y que `resetDatabase()` vacía la tabla. Fechas: texto ISO, no `Date` (hora local).
7. **Documentos:** `docs/backend/03-base-de-datos.md` y la bitácora.
8. Si protege una regla del dominio o la seguridad: mutaciones sobre el código que la usa (`/mutar`).
