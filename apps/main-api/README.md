# main-api

API de LibroYa (NestJS 12 + Prisma 7 + PostgreSQL 18). La documentación de diseño está en [`/docs`](../../docs/libroya-backend-guia.md).

## Requisitos

- Node.js 22 o superior (la guía recomienda 24 LTS)
- pnpm
- PostgreSQL **18** (con Docker o instalado en tu máquina). No sirve una versión anterior: el Outbox usa `uuidv7()`.

## Primer arranque

```bash
cd apps/main-api
pnpm install
cp .env.example .env      # ajusta DATABASE_URL solo si tu base de datos no es la de Docker
```

### 1. Base de datos

Elige una de las dos opciones.

**A. Con Docker** (no necesitas instalar nada más)

```bash
pnpm run db:up            # levanta PostgreSQL 18 y espera a que esté listo
```

Crea el usuario, la contraseña y la base `libroya` (puerto `5432`), que coinciden con el `DATABASE_URL` de `.env.example`. Los datos se guardan en un volumen de Docker.

```bash
docker compose down       # detiene la base y conserva los datos
docker compose down -v    # detiene la base y BORRA los datos
```

**B. Con PostgreSQL local**

Con PostgreSQL 18 ya instalado, crea el usuario y la base:

```sql
CREATE ROLE libroya LOGIN PASSWORD 'libroya' CREATEDB;
CREATE DATABASE libroya OWNER libroya;
```

`CREATEDB` es necesario: `prisma migrate dev` crea una base temporal ("shadow") para comparar migraciones. Si usas otro usuario, contraseña, base o puerto, cámbialos en `DATABASE_URL` dentro de `.env`:

```env
DATABASE_URL=postgresql://USUARIO:CONTRASEÑA@localhost:5432/NOMBRE_BD
```

No hace falta crear schemas ni tablas a mano: la migración crea los schemas `sales`, `catalog`, `inventory` y `messaging`.

### 2. Migraciones

```bash
pnpm exec prisma migrate dev     # aplica las migraciones y genera el cliente de Prisma
```

Hazlo la primera vez, y cada vez que cambie `prisma/schema.prisma` o llegue una migración nueva (`git pull`). En un servidor (no en desarrollo) se usa `pnpm run db:deploy`, que solo aplica migraciones sin crear nuevas.

### 3. Levantar la API

```bash
pnpm run start:dev
```

- Estado de la API y la base: <http://localhost:3000/health/ready>
- Documentación Swagger: <http://localhost:3000/docs>

## Comandos útiles

| Comando | Para qué |
|---|---|
| `pnpm run start:dev` | API en modo desarrollo, con recarga |
| `pnpm test` | Tests unitarios (no necesitan base de datos) |
| `pnpm run test:e2e` | Tests e2e y de integración (necesitan la base de datos levantada) |
| `pnpm lint` · `pnpm format` | Lint y formato |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma (se hace solo en `build` y `test`) |
| `pnpm run db:up` | Levanta PostgreSQL con Docker |

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `function uuidv7() does not exist` al migrar | La base no es PostgreSQL 18 |
| `/health/ready` responde 503, o `ECONNREFUSED` | La base no está levantada, o `DATABASE_URL` no coincide con ella |
| `port is already allocated` al hacer `db:up` | Ya hay un PostgreSQL en el puerto 5432. Detenlo, o usa el local (opción B) |
| `Cannot find module './generated/client.js'` | Falta generar el cliente: `pnpm run prisma:generate` |
| `ERR_PNPM_IGNORED_BUILDS` al instalar | Actualiza el repo (`git pull`): `pnpm-workspace.yaml` ya permite los scripts necesarios |
| `Cannot resolve environment variable: DATABASE_URL` | Falta el archivo `.env` (cópialo de `.env.example`) |
