# main-api

API de LibroYa (NestJS 12 + Prisma 7 + PostgreSQL 18). La documentación de diseño está en [`/docs`](../../docs/libroya-backend-guia.md).

Contenido: [Requisitos](#requisitos) · [Primer arranque](#primer-arranque) · [Variables de entorno](#variables-de-entorno) · [Base de datos](#base-de-datos) · [Migraciones](#migraciones) · [Datos de ejemplo](#datos-de-ejemplo) · [Levantar la API](#levantar-la-api) · [Outbox](#outbox-eventos-entre-contextos) · [Pruebas](#pruebas) · [Calidad de código](#calidad-de-código) · [Comandos](#comandos) · [Problemas frecuentes](#problemas-frecuentes)

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
| `PAYMENT_PROVIDER` | `fake` | Pasarela de pago: `fake` (simulada) o `external`. Con `NODE_ENV=production` la API no arranca con `fake`, porque aprueba cualquier tarjeta |
| `PAYMENT_API_URL` | vacía | Obligatoria solo si `PAYMENT_PROVIDER=external` |
| `PAYMENT_SIMULATED_DELAY_MS` | `3000` | Solo con `PAYMENT_PROVIDER=fake`: lo que tarda la pasarela simulada en cobrar y en reembolsar, como un proveedor real. `0` quita la demora |
| `OUTBOX_MAX_ATTEMPTS` | `8` | Reintentos de una entrega de eventos antes de marcarla como fallida |
| `CHECKOUT_RECOVERY_MINUTES` | `10` | Minutos tras los que se recupera una compra a medias (mínimo 2) |
| `DB_STATEMENT_TIMEOUT_MS` | `5000` | Tiempo máximo de cada sentencia SQL, en milisegundos. Mantiene acotada la duración de una compra |

`OUTBOX_MAX_ATTEMPTS` (corte 4), `PAYMENT_PROVIDER`, `PAYMENT_API_URL`, `CHECKOUT_RECOVERY_MINUTES` y `DB_STATEMENT_TIMEOUT_MS` (corte 5) ya se usan. `ADMIN_API_ENABLED` se valida desde ya y se usará con los endpoints de administración. El avance está en [docs/backend/00-avance.md](../../docs/backend/00-avance.md).

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

### Probar el catálogo

Con la API en marcha (`pnpm run start:dev`) y los datos de ejemplo cargados:

```bash
curl http://localhost:3000/books/9780132350884       # 200: { isbn, title, author, price: { amount, currency } }
curl http://localhost:3000/books/978-0-13-235088-4   # el ISBN también se acepta con guiones
curl http://localhost:3000/books/9780201633610       # 404 NOT_FOUND: libro inactivo
curl http://localhost:3000/books/123                 # 422 INVALID_ISBN
```

La reserva y la liberación de stock no tienen endpoint propio: las usa Ventas por dentro al comprar.

### Probar una compra

`POST /orders` reserva el stock, cobra y registra el pedido. Lleva un header `Idempotency-Key` (un UUID nuevo por intento de compra) y un cuerpo con el cliente, el token de la tarjeta y las líneas. Con la API en marcha y los datos de ejemplo:

```bash
# Ana (normal) compra 2 Clean Code: 90.00 + 10.00 de envío → 201 { orderId, charged: { amount: "100.00", currency: "PEN" } }
curl -X POST http://localhost:3000/orders \
  -H 'Content-Type: application/json' \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{"customerId":"11111111-1111-4111-8111-111111111111","cardToken":"tok_visa","items":[{"isbn":"9780132350884","quantity":2}]}'

# Consultar el pedido
curl http://localhost:3000/orders/<orderId>
```

| Prueba | Cómo | Resultado |
|---|---|---|
| Cliente premium | `customerId` de Luis (`2222…`), 2 Clean Code | `201`, `81.00 PEN` (10 % de descuento y envío gratis) |
| Pedido en dólares | Ana, 1 The Pragmatic Programmer | `201`, `18.00 USD` (15.00 + 3.00 de envío) |
| Reintento | La misma `Idempotency-Key` y el mismo cuerpo | `201` con el mismo `orderId`, sin cobrar otra vez |
| Clave reutilizada | La misma clave con otro carrito | `422 IDEMPOTENCY_KEY_REUSED` |
| Sin stock | Refactoring (stock 0) | `422 OUT_OF_STOCK`, no se cobra nada |
| Sin registro de stock | Code Complete | `422 STOCK_ITEM_NOT_FOUND` |
| Libro inactivo | Design Patterns | `404 NOT_FOUND` |
| Sin `Idempotency-Key`, o con una que no es UUID | — | `400` |

**La pasarela de pago simulada** (`PAYMENT_PROVIDER=fake`, la de por defecto) decide por el token de la tarjeta, sin salir a la red:

| `cardToken` | Resultado |
|---|---|
| `tok_declined` | `422 PAYMENT_DECLINED`; la reserva se libera y no queda pedido |
| `tok_error` | `500`: la pasarela "se cae"; se compensa igual (se libera la reserva y el intento queda anulado) |
| cualquier otro (por ejemplo `tok_visa`) | Aprobado |

La pasarela simulada **tarda 3 segundos** en cobrar (y en reembolsar), así que `POST /orders` responde pasados unos 3 s. Es a propósito: una segunda petición con la misma `Idempotency-Key` durante ese rato recibe `409 CHECKOUT_IN_PROGRESS`, que se puede ver con dos `curl` seguidos. Cámbialo con `PAYMENT_SIMULATED_DELAY_MS`.

El token solo viaja a la pasarela: no se guarda en la base ni se escribe en los logs.

Un segundo después de comprar, el relay del Outbox entrega el evento: la reserva pasa a `CONFIRMED` y el correo de confirmación aparece en el log (`Email a ana@example.com: …`) con el mismo `requestId` de la compra. Si algo se queda a medias (por ejemplo, el proceso se cae tras cobrar), `RecoverCheckoutsJob` lo reembolsa y lo libera pasados `CHECKOUT_RECOVERY_MINUTES` minutos. Con `PAYMENT_PROVIDER=external` se usa un proveedor real por HTTP (contrato en [docs/backend/05-piezas-clave.md](../../docs/backend/05-piezas-clave.md)).

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

## Outbox: eventos entre contextos

Cuando algo importante pasa en un contexto (por ejemplo, se crea un pedido), se guarda un **evento** en la misma transacción que el cambio, y otro proceso lo entrega después a quien lo escucha. Así el pedido y su evento se confirman juntos o no se confirma ninguno, y un fallo del proveedor de email no deshace una compra.

**Cómo funciona:** `OutboxWriter.append(tx, events)` guarda cada evento y una entrega por consumidor. El `OutboxRelay` corre cada segundo, reclama un lote (hasta 10 entregas), las entrega y las marca `DONE`. Si un consumidor falla, la entrega se reintenta con esperas de 2, 4, 8… segundos (hasta 5 minutos) y, al agotar `OUTBOX_MAX_ATTEMPTS`, queda `FAILED`.

**Agregar un consumidor** (no hay que registrarlo en ningún sitio; basta el decorador y listarlo en `providers`):

```ts
@OutboxHandler()
@Injectable()
export class SendOrderConfirmationConsumer implements ExternalOutboxConsumer<OrderPlacedEvent> {
  readonly kind = 'external' as const;   // 'db' si el efecto es en la propia base y debe confirmarse junto con la entrega
  readonly name = 'sales.send-order-confirmation';   // único
  readonly event = 'sales.order.placed';
  async handle(event: OrderPlacedEvent, ctx: DeliveryContext) {
    await this.notifier.send(/* … */ { idempotencyKey: ctx.eventId });   // el proveedor descarta repeticiones por esa clave
  }
}
```

| Tipo | Garantía | Qué hacer |
|---|---|---|
| `db` | El efecto y la marca `DONE` se confirman juntos: **efecto único** | Usa `ctx.tx` para escribir; no abras otra transacción |
| `external` | **Al menos una vez**: puede repetirse si el proceso cae a mitad | Envía `ctx.eventId` como clave de idempotencia |

Un consumidor nuevo solo recibe los eventos que se guarden **después** de desplegarlo. Un evento que nadie escucha no se guarda.

**Vigilar:** `GET /health/outbox` responde `200` mientras el relay de esa instancia siga dando vueltas, y `503` si está detenido (sin vueltas hace más de un minuto). Trae `relayLastRunAt`, `failed` (entregas `FAILED`) y `due` (entregas vencidas sin entregar). Las dos cantidades son informativas: alerta con tus propios umbrales (por ejemplo, `failed` creció, o `due` lleva varios minutos alto). **No lo uses como comprobación del balanceador**: un proveedor de email lento sacaría de servicio todas las instancias; para eso están `/health/live` y `/health/ready`. Tras arrancar, responde `503` durante aproximadamente un segundo, hasta la primera vuelta.

**Reprocesar entregas `FAILED`** (`FAILED` no borra nada: el evento, su payload y `last_error` quedan en la base; cada paso a `FAILED` se registra como error en el log):

```sql
SET TIME ZONE 'UTC';   -- las columnas no llevan zona horaria: se escriben en UTC, como hace la aplicación
UPDATE messaging.deliveries
SET status = 'PENDING', attempts = 0, next_attempt_at = now(), last_error = NULL
WHERE status = 'FAILED' AND consumer = 'sales.send-order-confirmation';
```

**Límites que conviene conocer:**
- Las entregas de un mismo pedido y consumidor salen en orden, pero el orden es el del identificador del evento, no el de confirmación: dos transacciones simultáneas del mismo pedido podrían confirmar al revés. Hoy hay un solo evento por pedido, así que no afecta.
- Un evento `FAILED` no frena los siguientes del mismo pedido.
- Una instancia entrega unos 10 eventos por segundo; para más, se añaden instancias (se reparten el trabajo sin repetir entregas).
- Al cerrar la aplicación, el relay espera hasta 15 segundos a la entrega en curso.

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
