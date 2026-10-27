# main-api

API de LibroYa (NestJS 12 + Prisma 7 + PostgreSQL 18). La documentación de diseño está en [`/docs`](../../docs/libroya-backend-guia.md).

Contenido: [Requisitos](#requisitos) · [Primer arranque](#primer-arranque) · [Variables de entorno](#variables-de-entorno) · [Base de datos](#base-de-datos) · [Migraciones](#migraciones) · [Datos de ejemplo](#datos-de-ejemplo) · [Levantar la API](#levantar-la-api) · [Pruebas](#pruebas) · [Calidad de código](#calidad-de-código) · [Comandos](#comandos) · [Problemas frecuentes](#problemas-frecuentes)

## Requisitos

- Node.js 24 LTS (≥ 24.15), fijado en `engines` de `package.json`
- pnpm
- PostgreSQL **18**, con Docker o instalado en tu máquina. No sirve una versión anterior: el Outbox usa `uuidv7()`.
- Docker: para la base de desarrollo si eliges esa opción, y siempre para `pnpm run test:e2e` (levanta su propio PostgreSQL)

## Primer arranque

Resumen de lo que hay que hacer la primera vez, en orden. Cada paso se explica más abajo.

```bash
cd apps/main-api
pnpm install                       # 1. dependencias
cp .env.example .env               # 2. variables de entorno (ajusta DB_PORT y las credenciales si no usas Docker)
pnpm run db:up                     # 3. base de datos (solo con Docker; si usas la tuya, ver "Base de datos")
pnpm exec prisma migrate dev       # 4. crea las tablas y genera el cliente de Prisma
pnpm run db:seed                   # (opcional) clientes, libros y stock de ejemplo
pnpm run start:dev                 # 5. API en http://localhost:3000
```

Compruébalo en <http://localhost:3000/health/ready> (debe responder 200) y en <http://localhost:3000/docs> (Swagger).

## Variables de entorno

Se leen del archivo `.env` (no se sube al repositorio; la plantilla es `.env.example`). Una variable definida en el terminal tiene prioridad sobre `.env`:

```bash
PORT=4000 pnpm run start:dev
```

La app valida las variables al arrancar y, si alguna es inválida, no inicia y dice cuál.

| Variable | Por defecto | Para qué |
|---|---|---|
| `DB_HOST` | — (obligatoria) | Servidor de PostgreSQL, ver [Base de datos](#base-de-datos) |
| `DB_PORT` | `5432` | Puerto de PostgreSQL (con Docker, `5433`) |
| `DB_USER` | — (obligatoria) | Usuario de PostgreSQL |
| `DB_PASSWORD` | — (obligatoria) | Contraseña. Puede llevar cualquier carácter: el código la codifica al armar la URL |
| `DB_NAME` | — (obligatoria) | Nombre de la base de datos |
| `PORT` | `3000` | Puerto de la API |
| `NODE_ENV` | `development` | `development`, `test` o `production` |
| `ADMIN_API_ENABLED` | `false` | Endpoints `/admin`, solo para desarrollo. Con `NODE_ENV=production` no se permite `true` |
| `PAYMENT_PROVIDER` | `fake` | Pasarela de pago: `fake` (simulada) o `external` |
| `PAYMENT_API_URL` | vacía | Obligatoria solo si `PAYMENT_PROVIDER=external` |
| `OUTBOX_MAX_ATTEMPTS` | `8` | Reintentos de una entrega de eventos antes de marcarla como fallida |
| `CHECKOUT_RECOVERY_MINUTES` | `10` | Minutos tras los que se recupera una compra a medias (mínimo 2) |

Las cuatro últimas ya se validan, pero se usan a medida que se implementan los cortes de [`docs/backend/00-avance.md`](../../docs/backend/00-avance.md).

## Base de datos

La conexión se define con cinco variables separadas (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). El código arma con ellas la URL `postgresql://USUARIO:CONTRASEÑA@HOST:PUERTO/NOMBRE_BD` en un solo lugar (`src/platform/config/database-url.ts`), que usan tanto la API como `prisma.config.ts`. La contraseña se codifica sola, así que no hay que escapar `@`, `:`, `/`, `#` ni `%`.

Elige una de las dos opciones.

### Opción A: Docker

```bash
pnpm run db:up
```

Levanta PostgreSQL 18 y espera a que esté listo. Crea el usuario `libroya`, con contraseña `libroya`, y la base `libroya`. La base queda publicada en el puerto **`5433`** de tu máquina (no en el 5432 habitual, para no chocar con un PostgreSQL local). `docker-compose.yml` lee las mismas variables `DB_*` de `.env`, y los valores de `.env.example` coinciden con los que usa, así que no hay que cambiar nada:

```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=libroya
DB_PASSWORD=libroya
DB_NAME=libroya
```

> [!warning]
> Postgres solo aplica `DB_USER`, `DB_PASSWORD` y `DB_NAME` la primera vez que crea el volumen. Si los cambias después, la base conserva los anteriores: recréala con `docker compose down -v` (borra los datos) o cambia la contraseña con `ALTER ROLE`.

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
DB_HOST=localhost
DB_PORT=5432
DB_USER=libroya
DB_PASSWORD=tu_contraseña
DB_NAME=libroya
```

- **`CREATEDB` es obligatorio:** `prisma migrate dev` crea una base temporal ("shadow") para comparar migraciones.
- **Si ya tienes un usuario y una base**, úsalos: basta con que el usuario tenga `CREATEDB` y permiso para crear schemas en esa base (lo más simple es que sea su dueño).
- **El puerto es el de tu instalación** (por defecto `5432`; el `5433` es el de Docker). Ajusta `DB_PORT`.
- **No hay que crear schemas ni tablas a mano:** la migración crea `sales`, `catalog`, `inventory` y `messaging`.

Comprueba que las credenciales funcionan antes de seguir:

```bash
psql "postgresql://libroya:tu_contraseña@localhost:5432/libroya" -c "select version()"
```

Debe mostrar `PostgreSQL 18.x`. Si muestra otra versión, esa no sirve.

### Base de datos para las pruebas

No tienes que preparar nada: `pnpm run test:e2e` levanta su propio PostgreSQL 18 en un contenedor (Testcontainers), aplica las migraciones y lo elimina al terminar. **No toca tu base de desarrollo**, ni siquiera si `.env` apunta a ella. Solo necesita Docker en marcha.

## Migraciones

```bash
pnpm exec prisma migrate dev      # desarrollo: aplica las pendientes, genera el cliente y, si cambió el schema, crea una nueva
pnpm run db:deploy                # servidor, CI o base de pruebas: solo aplica las existentes, no crea ninguna
pnpm exec prisma migrate reset    # BORRA la base y la recrea desde cero (solo desarrollo)
```

Hazlo la primera vez, y cada vez que cambie `prisma/schema.prisma` o llegue una migración nueva con un `git pull`.

Al cambiar `prisma/schema.prisma`: `pnpm exec prisma migrate dev --name descripcion_del_cambio`. Genera el SQL en `prisma/migrations/`, que se sube al repositorio. Prisma no permite declarar `CHECK` en el schema: se agregan a mano en ese SQL.

> Los datos de ejemplo (`pnpm run db:seed`) llegan con el corte 3 del [plan de avance](../../docs/backend/00-avance.md). Hoy la base queda vacía.

## Datos de ejemplo

```bash
pnpm run db:seed
```

Carga clientes, libros y stock para probar la API a mano (usa las variables `DB_*` de tu `.env`). **Se puede ejecutar las veces que quieras**: no duplica filas y restaura los datos de los clientes y del catálogo, pero no pisa el stock que ya exista, así que no pierdes las reservas que hayas hecho al probar. Los títulos y autores son reales; los precios y el stock, inventados. Los datos están en `prisma/seed-data.ts`.

| ISBN | Libro | Precio | Stock | Para probar |
|---|---|---|---|---|
| `9780132350884` | Clean Code | 45.00 PEN | 25 | Compra normal en soles |
| `9780321125217` | Domain-Driven Design | 120.00 PEN | 8 | Con dos unidades se supera el mínimo de envío gratis (150 PEN) |
| `9780135957059` | The Pragmatic Programmer | 15.00 USD | 40 | Compra en dólares |
| `9780134757599` | Refactoring | 22.50 USD | 0 | Agotado: reservarlo da `OUT_OF_STOCK` |
| `9780201633610` | Design Patterns | 95.00 PEN | 5 | Inactivo: el catálogo lo trata como inexistente |
| `9780735619678` | Code Complete | 85.00 PEN | sin registro | Reservarlo da `STOCK_ITEM_NOT_FOUND` |

| Cliente | `customerId` | Tipo |
|---|---|---|
| ana@example.com | `11111111-1111-4111-8111-111111111111` | Normal |
| luis@example.com | `22222222-2222-4222-8222-222222222222` | Premium (10 % de descuento y envío gratis) |

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
| `pnpm run test:e2e` | e2e e integración: arranca la app completa contra PostgreSQL real (`test/e2e/`, `test/integration/`) | No usa la tuya: levanta su propio PostgreSQL 18 en un contenedor, así que **necesita Docker en marcha** |

```bash
pnpm test                                        # unitarios
pnpm run test:e2e                                # e2e e integración (levantan su propio PostgreSQL; requiere Docker)
pnpm run test:watch                              # unitarios en modo observación
pnpm run test:cov                                # unitarios con cobertura
pnpm exec vitest run test/unit/env.schema.spec.ts   # un solo archivo
pnpm exec vitest run -t "texto del test"             # un test por nombre
```

- Los dos comandos generan el cliente de Prisma antes de ejecutarse.
- Los tests viven en `test/`, no junto al código: `unit/` para los unitarios, y `integration/` y `e2e/` para los que usan la base de datos.
- Los archivos de `integration/` y `e2e/` se ejecutan uno tras otro, porque comparten el contenedor. Cada archivo vacía las tablas antes de sus tests con `resetDatabase()` (`test/support/database.ts`), que solo funciona sobre ese contenedor.
- La primera ejecución descarga la imagen `postgres:18` si no la tienes.

## Calidad de código

```bash
pnpm lint                 # oxlint, con reglas que usan tipos
pnpm format               # Prettier, sobre src/ y test/ (reescribe los archivos)
pnpm run format:check     # comprueba el formato sin modificar nada
pnpm run build            # compila con tipos estrictos
```

Antes de subir cambios, con Docker en marcha, conviene correr todo de una vez:

```bash
pnpm lint && pnpm run format:check && pnpm run build && pnpm test && pnpm run test:e2e
```

### Integración continua (CI)

El workflow [`.github/workflows/main-api.yml`](../../.github/workflows/main-api.yml) repite esas comprobaciones en GitHub, en un entorno limpio y con `postgres:18`, y además aplica las migraciones y revisa vulnerabilidades (`pnpm audit --prod`). Corre solo, tras un `push` a `main` o `develop` y en los pull requests que tocan `apps/main-api`; **no se ejecuta en tu máquina**. Sirve para detectar lo que solo funciona en un equipo concreto y para ver en el pull request, antes de fusionar, si el cambio rompe algo.

## Comandos

| Comando | Para qué |
|---|---|
| `pnpm run start:dev` | API en desarrollo, con recarga |
| `pnpm run start:debug` | Igual, con el depurador de Node activo |
| `pnpm run build` · `pnpm run start:prod` | Compilar y ejecutar la versión compilada |
| `pnpm test` · `pnpm run test:e2e` · `pnpm run test:cov` | Pruebas |
| `pnpm lint` · `pnpm format` · `pnpm run format:check` | Lint, formato y comprobación de formato |
| `pnpm run db:up` | Levanta PostgreSQL 18 con Docker |
| `pnpm exec prisma migrate dev` | Migraciones en desarrollo |
| `pnpm run db:deploy` | Aplica las migraciones sin crear nuevas |
| `pnpm run db:seed` | Carga los [datos de ejemplo](#datos-de-ejemplo) (se puede repetir) |
| `pnpm run prisma:generate` | Regenera el cliente de Prisma (también se hace en `build`, `test` y `test:e2e`) |
| `pnpm exec prisma studio` | Explorador visual de la base de datos |

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `No se pudo iniciar PostgreSQL en un contenedor` al correr `test:e2e` | Docker no está en marcha. Compruébalo con `docker info`. `pnpm test` (unitarios) funciona sin Docker |
| `function uuidv7() does not exist` al migrar | La base no es PostgreSQL 18 |
| `P3014: Prisma Migrate could not create the shadow database` | El usuario no tiene `CREATEDB`: `ALTER ROLE libroya CREATEDB;` |
| `permission denied for schema public` al migrar | El usuario no es dueño de la base: `ALTER DATABASE libroya OWNER TO libroya;` |
| `P1000: Authentication failed` | Usuario o contraseña de `DB_USER` / `DB_PASSWORD` incorrectos (o la base se creó con otros: ver el aviso de Docker) |
| `/health/ready` responde 503, o `ECONNREFUSED` | La base no está levantada, o las variables `DB_*` no apuntan a ella (con Docker, `DB_PORT=5433`) |
| `port is already allocated` al hacer `db:up` | Algo ya usa el puerto 5433. Detenlo, o cambia el primer número de `ports` en `docker-compose.yml` y `DB_PORT` en `.env` |
| `EADDRINUSE` al arrancar la API | El puerto 3000 está ocupado: cambia `PORT` en `.env` |
| `Cannot find module './generated/client.js'` | Falta generar el cliente: `pnpm run prisma:generate` |
| `Faltan variables de base de datos: …` | Falta el archivo `.env` (cópialo de `.env.example`) o alguna variable `DB_*` |
| Los tests e2e fallan con 503 | La base no está levantada, o falta aplicar las migraciones en ella |
| `ERR_PNPM_IGNORED_BUILDS` al instalar | Actualiza el repo (`git pull`): `pnpm-workspace.yaml` ya permite los scripts necesarios |
| Un cambio de `schema.prisma` no se refleja | Falta `pnpm exec prisma migrate dev` |
