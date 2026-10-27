# main-api

API de LibroYa (NestJS 12 + Prisma 7 + PostgreSQL 18). La documentación de diseño está en [`/docs`](../../docs/libroya-backend-guia.md).

Contenido: [Requisitos](#requisitos) · [Primer arranque](#primer-arranque) · [Variables de entorno](#variables-de-entorno) · [Base de datos](#base-de-datos) · [Migraciones](#migraciones) · [Levantar la API](#levantar-la-api) · [Pruebas](#pruebas) · [Calidad de código](#calidad-de-código) · [Comandos](#comandos) · [Problemas frecuentes](#problemas-frecuentes)

## Requisitos

- Node.js 22 o superior (la guía recomienda 24 LTS)
- pnpm
- PostgreSQL **18**, con Docker o instalado en tu máquina. No sirve una versión anterior: el Outbox usa `uuidv7()`.
- Docker (solo si eliges esa opción de base de datos)

## Primer arranque

Resumen de lo que hay que hacer la primera vez, en orden. Cada paso se explica más abajo.

```bash
cd apps/main-api
pnpm install                       # 1. dependencias
cp .env.example .env               # 2. variables de entorno (ajusta DATABASE_URL si no usas Docker)
pnpm run db:up                     # 3. base de datos (solo con Docker; si usas la tuya, ver "Base de datos")
pnpm exec prisma migrate dev       # 4. crea las tablas y genera el cliente de Prisma
pnpm run start:dev                 # 5. API en http://localhost:3000
```

Compruébalo en <http://localhost:3000/health/ready> (debe responder 200) y en <http://localhost:3000/docs> (Swagger).

## Variables de entorno

Se leen del archivo `.env` (no se sube al repositorio; la plantilla es `.env.example`). Una variable definida en el terminal tiene prioridad sobre `.env`:

```bash
DATABASE_URL=postgresql://... pnpm run test:e2e
```

La app valida las variables al arrancar y, si alguna es inválida, no inicia y dice cuál.

| Variable | Por defecto | Para qué |
|---|---|---|
| `DATABASE_URL` | — (obligatoria) | Conexión a PostgreSQL, ver [Base de datos](#base-de-datos) |
| `PORT` | `3000` | Puerto de la API |
| `NODE_ENV` | `development` | `development`, `test` o `production` |
| `ADMIN_API_ENABLED` | `false` | Endpoints `/admin`, solo para desarrollo. Con `NODE_ENV=production` no se permite `true` |
| `PAYMENT_PROVIDER` | `fake` | Pasarela de pago: `fake` (simulada) o `external` |
| `PAYMENT_API_URL` | vacía | Obligatoria solo si `PAYMENT_PROVIDER=external` |
| `OUTBOX_MAX_ATTEMPTS` | `8` | Reintentos de una entrega de eventos antes de marcarla como fallida |
| `CHECKOUT_RECOVERY_MINUTES` | `10` | Minutos tras los que se recupera una compra a medias (mínimo 2) |

Las cuatro últimas ya se validan, pero se usan a medida que se implementan los cortes de [`docs/backend/00-avance.md`](../../docs/backend/00-avance.md).

## Base de datos

`DATABASE_URL` tiene este formato:

```text
postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/NOMBRE_BD
```

Si la contraseña tiene caracteres especiales (`@`, `:`, `/`, `#`, `%`, espacios…), hay que codificarlos en la URL: `@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`, `%` → `%25`.

Elige una de las dos opciones.

### Opción A: Docker

```bash
pnpm run db:up
```

Levanta PostgreSQL 18 y espera a que esté listo. Crea el usuario `libroya`, con contraseña `libroya`, y la base `libroya` en el puerto `5432`. Coinciden con el `DATABASE_URL` de `.env.example`, así que no hay que cambiar nada:

```env
DATABASE_URL=postgresql://libroya:libroya@localhost:5432/libroya
```

Los datos quedan en un volumen de Docker y sobreviven a los reinicios.

```bash
docker compose down       # detiene la base y conserva los datos
docker compose down -v    # detiene la base y BORRA los datos
```

### Opción B: PostgreSQL instalado en tu máquina

Necesitas PostgreSQL **18** corriendo. Conéctate con un usuario administrador (por ejemplo `psql -U postgres`) y crea un usuario y una base propios para el proyecto:

```sql
CREATE ROLE libroya LOGIN PASSWORD 'tu_contraseña' CREATEDB;
CREATE DATABASE libroya OWNER libroya;
```

Luego pon tus credenciales en `.env`:

```env
DATABASE_URL=postgresql://libroya:tu_contraseña@localhost:5432/libroya
```

- **`CREATEDB` es obligatorio:** `prisma migrate dev` crea una base temporal ("shadow") para comparar migraciones.
- **Si ya tienes un usuario y una base**, úsalos: basta con que el usuario tenga `CREATEDB` y permiso para crear schemas en esa base (lo más simple es que sea su dueño).
- **Si tu PostgreSQL usa otro puerto**, cámbialo en la URL.
- **No hay que crear schemas ni tablas a mano:** la migración crea `sales`, `catalog`, `inventory` y `messaging`.

Comprueba que las credenciales funcionan antes de seguir:

```bash
psql "postgresql://libroya:tu_contraseña@localhost:5432/libroya" -c "select version()"
```

Debe mostrar `PostgreSQL 18.x`. Si muestra otra versión, esa no sirve.

### Base de datos aparte para las pruebas

Los tests e2e usan `DATABASE_URL`. Hoy solo leen, pero conviene tener una base de pruebas separada para no mezclar datos con los de desarrollo:

```sql
CREATE DATABASE libroya_test OWNER libroya;
```

```bash
export DATABASE_URL=postgresql://libroya:libroya@localhost:5432/libroya_test
pnpm run db:deploy        # aplica las migraciones en la base de pruebas
pnpm run test:e2e
```

Con Docker, la base se crea con `docker compose exec db psql -U libroya -d libroya -c "CREATE DATABASE libroya_test OWNER libroya"`.

## Migraciones

```bash
pnpm exec prisma migrate dev      # desarrollo: aplica las pendientes, genera el cliente y, si cambió el schema, crea una nueva
pnpm run db:deploy                # servidor, CI o base de pruebas: solo aplica las existentes, no crea ninguna
pnpm exec prisma migrate reset    # BORRA la base y la recrea desde cero (solo desarrollo)
```

Hazlo la primera vez, y cada vez que cambie `prisma/schema.prisma` o llegue una migración nueva con un `git pull`.

Al cambiar `prisma/schema.prisma`: `pnpm exec prisma migrate dev --name descripcion_del_cambio`. Genera el SQL en `prisma/migrations/`, que se sube al repositorio. Prisma no permite declarar `CHECK` en el schema: se agregan a mano en ese SQL.

> Los datos de ejemplo (`pnpm run db:seed`) llegan con el corte 3 del [plan de avance](../../docs/backend/00-avance.md). Hoy la base queda vacía.

## Levantar la API

```bash
pnpm run start:dev        # desarrollo, con recarga al guardar
```

| Qué | Dónde |
|---|---|
| API | <http://localhost:3000> (o el `PORT` de tu `.env`) |
| Estado de la API (sin base de datos) | `GET /health/live` |
| Estado de la API y la base de datos | `GET /health/ready` (503 si la base no responde) |
| Documentación Swagger | `/docs` |

Todas las respuestas incluyen el header `X-Request-Id`. Si envías uno en la petición se devuelve el mismo, y aparece en los logs.

Para ejecutar la versión compilada, como en un servidor:

```bash
pnpm run build            # genera dist/
pnpm run start:prod       # node dist/main
```

## Pruebas

Hay dos tipos, y solo uno necesita base de datos:

| Comando | Qué prueba | ¿Necesita la BD? |
|---|---|---|
| `pnpm test` | Unitarios: configuración, contexto de petición, filtro de errores (`test/unit/`) | No |
| `pnpm run test:e2e` | e2e e integración: arranca la app completa contra PostgreSQL real (`test/e2e/`, `test/integration/`) | **Sí**: base levantada, migraciones aplicadas y `DATABASE_URL` definida |

```bash
pnpm test                                        # unitarios
pnpm run test:e2e                                # e2e (levanta antes la base: pnpm run db:up)
pnpm run test:watch                              # unitarios en modo observación
pnpm run test:cov                                # unitarios con cobertura
pnpm exec vitest run test/unit/env.schema.spec.ts   # un solo archivo
pnpm exec vitest run -t "texto del test"             # un test por nombre
```

- Los dos comandos generan el cliente de Prisma antes de ejecutarse.
- Los tests viven en `test/`, no junto al código: `unit/` para los unitarios, y `integration/` y `e2e/` para los que usan la base de datos.
- Los tests de integración de los siguientes cortes arrancarán su propio PostgreSQL con Testcontainers (necesitan Docker en marcha).

## Calidad de código

```bash
pnpm lint                 # oxlint, con reglas que usan tipos
pnpm format               # Prettier, sobre src/ y test/
pnpm run build            # compila con tipos estrictos
```

Antes de subir cambios conviene que pasen `pnpm lint`, `pnpm test`, `pnpm run test:e2e` y `pnpm run build`.

## Comandos

| Comando | Para qué |
|---|---|
| `pnpm run start:dev` | API en desarrollo, con recarga |
| `pnpm run start:debug` | Igual, con el depurador de Node activo |
| `pnpm run build` · `pnpm run start:prod` | Compilar y ejecutar la versión compilada |
| `pnpm test` · `pnpm run test:e2e` · `pnpm run test:cov` | Pruebas |
| `pnpm lint` · `pnpm format` | Lint y formato |
| `pnpm run db:up` | Levanta PostgreSQL 18 con Docker |
| `pnpm exec prisma migrate dev` | Migraciones en desarrollo |
| `pnpm run db:deploy` | Aplica las migraciones sin crear nuevas |
| `pnpm run db:seed` | Datos de ejemplo (pendiente, corte 3) |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma (también se hace en `build`, `test` y `test:e2e`) |
| `pnpm exec prisma studio` | Explorador visual de la base de datos |

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `function uuidv7() does not exist` al migrar | La base no es PostgreSQL 18 |
| `P3014: Prisma Migrate could not create the shadow database` | El usuario no tiene `CREATEDB`: `ALTER ROLE libroya CREATEDB;` |
| `permission denied for schema public` al migrar | El usuario no es dueño de la base: `ALTER DATABASE libroya OWNER TO libroya;` |
| `P1000: Authentication failed` | Usuario o contraseña de `DATABASE_URL` incorrectos, o con caracteres sin codificar |
| `/health/ready` responde 503, o `ECONNREFUSED` | La base no está levantada, o `DATABASE_URL` no apunta a ella |
| `port is already allocated` al hacer `db:up` | Ya hay un PostgreSQL en el puerto 5432. Detenlo, o usa el tuyo (opción B) |
| `EADDRINUSE` al arrancar la API | El puerto 3000 está ocupado: cambia `PORT` en `.env` |
| `Cannot find module './generated/client.js'` | Falta generar el cliente: `pnpm run prisma:generate` |
| `Cannot resolve environment variable: DATABASE_URL` | Falta el archivo `.env` (cópialo de `.env.example`) |
| Los tests e2e fallan con 503 | La base no está levantada, o falta aplicar las migraciones en ella |
| `ERR_PNPM_IGNORED_BUILDS` al instalar | Actualiza el repo (`git pull`): `pnpm-workspace.yaml` ya permite los scripts necesarios |
| Un cambio de `schema.prisma` no se refleja | Falta `pnpm exec prisma migrate dev` |
