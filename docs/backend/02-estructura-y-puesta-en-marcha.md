# Backend: estructura y puesta en marcha

> Secciones 3 y 4 de la guía.

## 3. Estructura de carpetas

Parte de la estructura v5 (contexto → capa → módulo → archivo), con los ajustes de la tabla de abajo.

Los archivos sin marca son de las fases 0–9. Los marcados con **(fase N)** se agregan en [07-fases-y-roadmap.md](07-fases-y-roadmap.md). Los marcados con **✅ existe** ya están en `apps/main-api/` (scaffold del CLI); ya se ajustaron o se crearon en el corte 1.

```text
apps/main-api/                        ← "libroya-api" en el resto de la guía
├── package.json                      ✅ hecho: dependencias y scripts (corte 1)
├── tsconfig.json                     ✅ existe: sin cambios
├── tsconfig.build.json               ✅ existe: excluye test/ y *spec.ts
├── nest-cli.json                     ✅ existe: sin cambios
├── .oxlintrc.json · .prettierrc      ✅ existen: lint y formato
├── vitest.config.ts                  ✅ hecho: include `test/unit/**/*.spec.ts`
├── vitest.config.e2e.ts              ✅ hecho: include `test/{integration,e2e}/**/*.spec.ts`
├── docker-compose.yml                PostgreSQL 18
├── .env                              no se sube al repositorio (ya ignorado)
├── .gitignore                        ✅ hecho: incluye src/platform/prisma/generated/
├── prisma.config.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── main.ts                       ✅ hecho (corte 1)
│   ├── app.module.ts                 ✅ hecho (corte 1); se amplía en cada corte
│   │
│   ├── shared-kernel/
│   │   ├── isbn.vo.ts
│   │   ├── domain-event.ts           eventName, eventVersion, aggregateId, occurredOn
│   │   ├── domain.errors.ts          DomainError, NotFoundError, ConflictError
│   │   └── role.ts                   Role (BUYER | ADMIN), ROLES   ✅ hecho (7.2)
│   │
│   ├── contracts/                    ← Published Language
│   │   ├── sales/
│   │   │   └── order-placed.event.ts
│   │   ├── identity/
│   │   │   └── user-registered.event.ts                    ✅ hecho (7.3)
│   │   ├── catalog/
│   │   │   ├── get-book-price.query.ts
│   │   │   └── book-created.event.ts                       ✅ hecho (6.5)
│   │   └── inventory/
│   │       ├── reserve-stock.command.ts
│   │       ├── release-stock.command.ts
│   │       └── stock.errors.ts       OutOfStockError, StockItemNotFoundError
│   │
│   ├── platform/
│   │   ├── config/
│   │   │   └── env.schema.ts
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   ├── prisma.service.ts
│   │   │   └── generated/            lo crea `prisma generate` (no se sube)
│   │   ├── auth/                                           ✅ hecho (7.2): authenticated-user.ts, access-token-verifier.ts
│   │   │                                                      (el puerto del guard; lo implementa Identidad)
│   │   │                                                   ✅ hecho (7.6): auth.guard.ts (global, denegado por defecto),
│   │   │                                                      public.decorator.ts, roles.decorator.ts,
│   │   │                                                      current-user.decorator.ts, route-access.ts (7.11: quién puede
│   │   │                                                      llamar a cada ruta; lo usan el guard y Swagger)
│   │   ├── outbox/
│   │   │   ├── outbox.module.ts                            ✅ hecho (4.1); importa DiscoveryModule, no ScheduleModule
│   │   │   ├── outbox-consumer.ts    DeliveryContext, DbOutboxConsumer, ExternalOutboxConsumer   ✅ hecho (4.1)
│   │   │   ├── outbox-handler.decorator.ts                 ✅ hecho (4.1)
│   │   │   ├── outbox.registry.ts                          ✅ hecho (4.1)
│   │   │   ├── outbox.writer.ts                            ✅ hecho (4.2)
│   │   │   ├── outbox.relay.ts                             ✅ runOnce hecho (4.3); ciclo de vida en 4.6
│   │   │   └── outbox.health.ts                            ✅ hecho (4.7); lo provee HealthModule
│   │   ├── observability/
│   │   │   ├── request-context.ts
│   │   │   ├── request-id.middleware.ts
│   │   │   ├── request-context.interceptor.ts
│   │   │   ├── request-aware.logger.ts
│   │   │   └── access-log.middleware.ts                    ✅ hecho (7.10): una línea por petición, sin secretos
│   │   ├── http/
│   │   │   ├── configure-app.ts
│   │   │   ├── configure-swagger.ts
│   │   │   ├── domain-exception.filter.ts
│   │   │   ├── configure-swagger.ts                        ✅ hecho (7.11): esquema Bearer y el acceso de cada ruta
│   │   │   ├── configure-security.ts                       ✅ hecho (7.10): helmet, CORS, proxy y registro de accesos
│   │   │   └── admin-api.decorator.ts                      ✅ hecho (6.4; 7.9): @AdminApi() = @Roles('ADMIN') + etiqueta `admin`
│   │   └── health/
│   │       ├── health.module.ts
│   │       ├── health.controller.ts
│   │       └── db.health.ts
│   │
│   └── contexts/
│       ├── sales/
│       │   ├── sales.module.ts                             ✅ hecho (5.9)
│       │   ├── domain/
│       │   │   ├── order/
│       │   │   │   ├── order.aggregate.ts
│       │   │   │   ├── order-line.entity.ts
│       │   │   │   ├── order.factory.ts
│       │   │   │   ├── shipping-address.vo.ts              ✅ hecho (6.2)
│       │   │   │   ├── order.repository.ts
│       │   │   │   ├── checkout-log.port.ts
│       │   │   │   ├── catalog-pricing.port.ts
│       │   │   │   ├── stock-reservation.port.ts
│       │   │   │   └── notifier.port.ts
│       │   │   ├── customer/
│       │   │   │   ├── customer.aggregate.ts
│       │   │   │   ├── email.vo.ts
│       │   │   │   └── customer.repository.ts
│       │   │   ├── pricing/
│       │   │   │   ├── pricing.service.ts
│       │   │   │   ├── pricing-context.ts
│       │   │   │   ├── free-shipping.specification.ts
│       │   │   │   ├── minimum-subtotal.specification.ts
│       │   │   │   ├── premium-customer.specification.ts
│       │   │   │   └── premium-offer.specification.ts
│       │   │   ├── payment/
│       │   │   │   └── payment-gateway.port.ts
│       │   │   └── shared/
│       │   │       ├── money.vo.ts   decimal.js
│       │   │       └── specification.ts
│       │   ├── application/order/
│       │   │   ├── place-order.command.ts
│       │   │   ├── place-order.handler.ts
│       │   │   ├── get-order.query.ts                      ✅ hecho (5.8)
│       │   │   ├── list-customer-orders.query.ts           ✅ hecho (6.9)
│       │   │   ├── recover-checkouts.job.ts                saga: recupera checkouts a medias   ✅ hecho (5.6)
│       │   │   └── send-order-confirmation.consumer.ts     consumidor `external` del Outbox   ✅ hecho (5.7)
│       │   └── infrastructure/
│       │       ├── order/
│       │       │   ├── order.controller.ts                 ✅ hecho (5.8)
│       │       │   ├── place-order.dto.ts                  ✅ hecho (5.8)
│       │       │   ├── (ShippingAddressDto vive en place-order.dto.ts) ✅ hecho (6.3)
│       │       │   ├── list-orders.dto.ts                  ✅ hecho (6.9) (nombre real)
│       │       │   ├── get-order.handler.ts                ✅ hecho (5.8)
│       │       │   ├── list-customer-orders.handler.ts     ✅ hecho (6.9); también order-cursor.ts y order-view.ts
│       │       │   ├── prisma-order.repository.ts          ✅ hecho (5.3)
│       │       │   ├── order.mapper.ts                     ✅ hecho (5.3)
│       │       │   ├── prisma-checkout-log.adapter.ts      ✅ hecho (5.2)
│       │       │   ├── catalog-in-process.adapter.ts       ✅ hecho (5.4)
│       │       │   ├── inventory-in-process.adapter.ts     ✅ hecho (5.4)
│       │       │   └── console-notifier.adapter.ts         ✅ hecho (5.4)
│       │       ├── customer/
│       │       │   ├── prisma-customer.repository.ts       ✅ hecho (5.2)
│       │       │   └── create-customer.consumer.ts         ✅ hecho (7.5) consumidor `db` de identity.user.registered
│       │       └── payment/
│       │           ├── simulated-payment-gateway.adapter.ts   ✅ hecho (5.5); en la guía v5 se llamaba FakePaymentGateway
│       │           └── external-payment.adapter.ts            ✅ hecho (5.5)
│       │
│       ├── catalog/
│       │   ├── catalog.module.ts
│       │   ├── application/book/
│       │   │   ├── search-books.query.ts                   ✅ hecho (6.1)
│       │   │   ├── create-book.command.ts                  ✅ hecho (6.5)
│       │   │   ├── update-book.command.ts                  ✅ hecho (6.7) también desactiva y reactiva (ver desvíos)
│       │   │   └── admin-book.ts                           ✅ hecho (6.7) el libro + `active`, como lo ve la administración
│       │   ├── domain/book/                            ✅ hecho (6.5 y 6.7): reglas de título, autor y precio
│       │   │   ├── book-rules.ts
│       │   │   ├── new-book.ts
│       │   │   └── book-changes.ts
│       │   └── infrastructure/book/                        todos usan Prisma directo
│       │       ├── book.controller.ts
│       │       ├── book-price.response.ts                  esquema de la respuesta, solo para Swagger
│       │       ├── get-book-price.handler.ts
│       │       ├── search-books.dto.ts                     ✅ hecho (6.1)
│       │       ├── search-books.handler.ts                 ✅ hecho (6.1)
│       │       ├── admin-book.controller.ts                ✅ hecho (6.5) guard en la clase
│       │       ├── create-book.dto.ts                      ✅ hecho (6.5)
│       │       ├── (UpdateBookDto vive en create-book.dto.ts)
│       │       ├── create-book.handler.ts                  ✅ hecho (6.5) libro + evento en 1 transacción
│       │       └── update-book.handler.ts                  ✅ hecho (6.7) datos, precio y estado en una transacción
│       │
│       ├── inventory/
│       │   ├── inventory.module.ts
│       │   ├── domain/stock/
│       │   │   └── stock-item.aggregate.ts
│       │   ├── application/stock/
│       │   │   └── add-stock.command.ts                    ✅ hecho (6.8)
│       │   └── infrastructure/stock/                       todos usan Prisma directo
│       │       ├── reserve-stock.handler.ts                ✅ hecho (corte 3)
│       │       ├── release-stock.handler.ts                ✅ hecho (corte 3)
│       │       ├── lock-order.ts                           sortByIsbn: el orden de bloqueo de reservar y liberar
│       │       ├── order-id.ts                             assertOrderId: el orderId debe ser un UUID
│       │       ├── confirm-reservation.consumer.ts         consumidor `db` del Outbox   ✅ hecho (5.7)
│       │       ├── create-stock-item.consumer.ts           ✅ hecho (6.6) consumidor `db`
│       │       ├── admin-stock.controller.ts               ✅ hecho (6.8) guard en la clase
│       │       ├── add-stock.dto.ts                        ✅ hecho (6.8)
│       │       └── add-stock.handler.ts                    ✅ hecho (6.8)
│       │
│       └── identity/                                       (fase 15) usuarios, roles y guards
│           ├── identity.module.ts                          ✅ hecho (7.1; 7.2 añade los tokens)
│           ├── application/                                ✅ hecho: access-token-issuer.ts (7.2),
│           │                                                  register-user.command.ts, login.command.ts (7.3),
│           │                                                  session.ts, refresh-session.command.ts,
│           │                                                  logout.command.ts (7.4)
│           ├── domain/                                     ✅ hecho (7.1): email.vo.ts, password-policy.ts,
│           │                                                  password-hasher.port.ts, user.aggregate.ts
│           └── infrastructure/                             ✅ hecho: scrypt-password-hasher.ts (7.1), create-admin.ts (7.9),
│                                                              auth-throttler.ts (7.10),
│                                                              jwt-token.service.ts (7.2), register-user.handler.ts,
│                                                              login.handler.ts, auth.controller.ts, auth.dto.ts,
│                                                              auth.responses.ts (7.3), refresh-token.ts,
│                                                              session.service.ts, refresh-session.handler.ts,
│                                                              logout.handler.ts (7.4)
│
└── test/
    ├── fakes/                                              ✅ hecho (corte 2); se importan desde index.ts
    │   ├── in-memory-order-repository.ts
    │   ├── in-memory-checkout-log.ts
    │   ├── in-memory-customer-repository.ts
    │   ├── fake-stock-reservation.ts
    │   ├── fake-payment-gateway.ts
    │   ├── fake-notifier.ts
    │   ├── fixed-catalog.ts
    │   └── fixtures.ts                                     ISBN, fixedCatalog(), customersWithPremium()
    ├── support/
    │   ├── architecture.ts                                 reglas de dependencias entre capas
    │   ├── global-setup.ts                                 postgres:18 con Testcontainers para integration/ y e2e/
    │   ├── database.ts                                     query(), resetDatabase() y su guardián
    │   ├── builders.ts                                     insertBook(), insertStock() con SQL directo
    │   └── nest.ts                                         createTestApp(): bus CQRS y módulos elegidos sobre la base de pruebas
    ├── unit/
    │   ├── money.vo.spec.ts
    │   ├── order.aggregate.spec.ts
    │   ├── pricing.service.spec.ts
    │   ├── dependency-rules.spec.ts                        domain/ sin Nest ni Prisma; contracts/ sin contexts/
    │   └── place-order.handler.spec.ts
    ├── integration/                                        PostgreSQL 18 con Testcontainers
    │   ├── outbox.relay.spec.ts
    │   ├── recover-checkouts.job.spec.ts
    │   └── stock.handlers.spec.ts
    └── e2e/
        └── orders.e2e.spec.ts
```

Los tests unitarios van en `test/unit/`, no junto al código, y desde el corte 9 (tarea `9.12`) **repartidos por carpeta**, según dónde vive el código que prueban: `sales/`, `catalog/`, `identity/`, `inventory/`, `platform/` y `shared-kernel/`; `architecture/` para las reglas que cruzan contextos (`dependency-rules`, `contracts`, el uso de la configuración) y `tooling/` para los fakes, los builders, el seed y las ayudas de las propias pruebas. Una prueba suelta en la raíz de `test/unit/` hace fallar `architecture/test-layout.spec.ts`. Las de integración y e2e siguen planas.

Las **specifications** del dominio usan el sufijo `.specification.ts` (en la guía v5 era `.spec.ts`). Con `.spec.ts`, Vitest las tomaría por archivos de test. Las clases no cambian de nombre (`MinimumSubtotalSpec`, `freeShippingSpec`).

| Cambio respecto a la guía v5 | Por qué |
|---|---|
| **Puertos como `abstract class`**, no `interface` | Sirven como token de inyección de Nest sin poner decoradores en el dominio |
| **`contracts/` para comandos, queries y eventos públicos** | Un contexto usa a otro sin importar su código interno |
| **Ventas → Inventario por `CommandBus`** (puerto `StockReservation`) | La reserva es sincrónica porque el pedido depende de ella |
| **Handlers de queries en `infrastructure/`** (`GetOrderHandler`, `GetBookPriceHandler`) | Las lecturas no pasan por el dominio: leen directo con Prisma (lado de lectura de CQRS) |
| **Relay propio en vez del EventBus de Nest** | El EventBus no espera a los handlers ni propaga sus errores; el relay sí lo hace |
| **Sufijo `.consumer.ts`** | Distingue una reacción del Outbox de un handler de comando |
| **Saga mínima, sin `@Saga()` de Nest** | Las compensaciones ocurren en el handler; el checkout persistido y su job cubren las caídas |
| **Inventario sin repositorio por ahora** | La reserva es un `UPDATE` atómico; un repositorio con bloqueo optimista no aportaría nada todavía. Por eso sus handlers usan Prisma directo y viven en `infrastructure/` (regla 3 de la arquitectura) |
| **Transacciones explícitas con `prisma.$transaction(tx => …)`** | Cada operación atómica vive en un solo lugar (nunca hay transacciones entre contextos), así que basta con pasar `tx`; sin librerías extra en un punto crítico |
| **Consumidores que escriben en BD van en `infrastructure/`** | Reciben el `tx` de Prisma; los que solo llaman a servicios externos quedan en `application/` |
| **`Money` con decimal.js** (en vez de céntimos `number`) | Exactitud con más de 2 decimales en valores intermedios (por ejemplo, el valor unitario sin IGV que exige SUNAT) y redondeo explícito al final |
| **Imports relativos con `.js`** | Proyecto ESM: `import { Order } from './order.aggregate.js'` |

---

## 4. Puesta en marcha

> [!note] El scaffold ya está creado
> `nest new` ya se ejecutó: el proyecto está en `apps/main-api/` con ESM, Vitest, oxlint y Prettier. No lo repitas. Empieza por instalar lo que falta.

```bash
cd apps/main-api

pnpm add -E @nestjs/cqrs @nestjs/config @nestjs/swagger @nestjs/schedule @nestjs/terminus \
      class-validator class-transformer zod dotenv \
      @prisma/client@^7 @prisma/adapter-pg@^7 pg decimal.js
pnpm add -E -D prisma@^7 tsx @types/pg @testcontainers/postgresql
```

`supertest` y `@types/supertest` ya están en `devDependencies`, así que no se vuelven a instalar. pnpm bloquea por defecto los scripts de instalación de algunas dependencias. Según la versión, solo avisa (pnpm 10) o **falla con `ERR_PNPM_IGNORED_BUILDS`** (versiones más nuevas). Por eso el repositorio trae `apps/main-api/pnpm-workspace.yaml`, que permite los scripts de `prisma`, `@prisma/engines` y `esbuild` (el que usa `tsx`) y rechaza el resto (`ssh2`, `cpu-features`, `protobufjs`, `@scarf/scarf`). Si agregas una dependencia con scripts de instalación, apruébala con `pnpm approve-builds`. Al pasar un rango (`prisma@^7`), pnpm deja el `^` aunque uses `-E`: fija la versión exacta en `package.json`.

- **`pg`** es el driver que usa `@prisma/adapter-pg`. Si tu versión del adaptador ya lo trae como dependencia, instalarlo explícitamente no causa problemas y fija su versión.
- **`tsx`** lo necesita el seed (`prisma.config.ts` lo ejecuta con `tsx prisma/seed.ts`).

**Scripts en `package.json`:** el scaffold ya trae `build`, `start`, `start:dev`, `start:debug`, `start:prod`, `format`, `lint`, `test`, `test:watch`, `test:cov`, `test:debug` y `test:e2e`. Agrega estos y cambia `test:e2e`:

```json
{
  "scripts": {
    "db:up": "docker compose up -d --wait",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "prisma db seed",
    "prisma:generate": "prisma generate",
    "prebuild": "prisma generate",
    "pretest": "prisma generate",
    "test:e2e": "prisma generate && vitest run --config ./vitest.config.e2e.ts"
  }
}
```

El único script que ya existía y cambió es `test:e2e`, que ahora ejecuta `prisma generate` antes de Vitest.

El cliente generado debe estar en `.gitignore` (ya está: `/src/platform/prisma/generated/`), así que **`prisma generate` debe correr antes de compilar o testear**, en local y en CI (de eso se encargan `prebuild` y `pretest`).

**`docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:18
    environment: { POSTGRES_USER: libroya, POSTGRES_PASSWORD: libroya, POSTGRES_DB: libroya }
    ports: ["5433:5432"]   # puerto 5433 en tu máquina (5432 dentro del contenedor)
    volumes:
      - pgdata:/var/lib/postgresql   # desde la v18 el volumen va aquí, no en /var/lib/postgresql/data
    healthcheck:                     # permite `docker compose up --wait`
      test: ["CMD-SHELL", "pg_isready -U libroya -d libroya"]
      interval: 2s
      timeout: 3s
      retries: 15
volumes:
  pgdata:
```

**Primer arranque:**

```bash
pnpm run db:up                         # espera a que PostgreSQL esté listo
pnpm exec prisma migrate dev --name init   # crea los schemas sales, catalog, inventory y messaging, y sus tablas
pnpm run db:seed                       # clientes, libros y stock de ejemplo
pnpm run start:dev
```

> [!important] PostgreSQL 18 en todos lados
> El outbox usa `uuidv7()`, que solo existe desde PostgreSQL 18. La misma versión debe usarse en `docker-compose.yml`, en Testcontainers (`postgres:18`) y en CI; con una versión anterior, la migración falla.

**`.env`**

```env
DB_HOST=localhost
DB_PORT=5433
DB_USER=libroya
DB_PASSWORD=libroya
DB_NAME=libroya
PORT=3000
PAYMENT_PROVIDER=fake            # fake | external
PAYMENT_API_URL=
PAYMENT_SIMULATED_DELAY_MS=3000  # solo con fake: lo que tarda la pasarela simulada en cobrar y reembolsar (0 = sin demora)
EMAIL_SIMULATED_DELAY_MS=3000    # lo que tarda el correo simulado en "enviarse" (0 = sin demora)
CORS_ORIGINS=                    # orígenes permitidos por CORS, separados por comas (vacía: sin CORS)
TRUST_PROXY=0                    # proxies delante de la API (de dónde sale la dirección del cliente)
RATE_LIMIT_WINDOW_SECONDS=60     # límite de intentos de /auth: ventana y máximos (login por dirección y por correo, registro, renovación)
RATE_LIMIT_LOGIN_IP=20
RATE_LIMIT_LOGIN_ACCOUNT=5
RATE_LIMIT_REGISTER_IP=10
RATE_LIMIT_REFRESH_IP=30
JWT_SECRET=                      # secreto de los tokens (≥ 32 caracteres variados); obligatorio en producción
ACCESS_TOKEN_TTL_SECONDS=900     # vida del token de acceso (de 60 a 3600)
REFRESH_TOKEN_TTL_DAYS=14        # días que vale un token de refresco sin usarse (de 1 a 90)
PASSWORD_HASH_LOG_N=15           # costo del hash de contraseñas (scrypt, N = 2^valor); en producción no puede ser menor que 15
OUTBOX_MAX_ATTEMPTS=8
CHECKOUT_RECOVERY_MINUTES=10     # debe superar la duración máxima del handler (no solo de la petición HTTP)
DB_STATEMENT_TIMEOUT_MS=5000     # límite de cada sentencia SQL; mantiene acotada la duración de la compra
RETENTION_OUTBOX_DAYS=30         # corte 9: días que se guardan los datos terminados antes de purgarlos (outbox, checkouts, reservas y tokens de refresco)
RETENTION_CHECKOUT_DAYS=30
RETENTION_RESERVATION_DAYS=90
RETENTION_REFRESH_TOKEN_DAYS=7
```

**`platform/config/env.schema.ts`**: todo lo que llega de `.env` es texto; el schema lo convierte y valida al arrancar.

```ts
import { z } from 'zod';

const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()); // `PAYMENT_API_URL=` vacío

export const envSchema = z
  .looseObject({                                    // deja pasar el resto de variables del proceso (Zod 3: z.object({…}).passthrough())
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().default(5432),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_NAME: z.string().min(1),
    PORT: z.coerce.number().int().default(3000),
    PAYMENT_PROVIDER: z.enum(['fake', 'external']).default('fake'),
    PAYMENT_API_URL: optionalUrl,
    PAYMENT_SIMULATED_DELAY_MS: z.coerce.number().int().min(0).default(3000), // solo con PAYMENT_PROVIDER=fake
    EMAIL_SIMULATED_DELAY_MS: z.coerce.number().int().min(0).default(3000), // lo que tarda el correo simulado
    JWT_SECRET: optionalSecret, // ≥ 32 caracteres con variedad; obligatorio en producción
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
    PASSWORD_HASH_LOG_N: z.coerce.number().int().min(4).max(20).default(15), // costo del hash de contraseñas (en producción, ≥ 15)
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(8),
    CHECKOUT_RECOVERY_MINUTES: z.coerce.number().int().min(2).default(10),
    RETENTION_OUTBOX_DAYS: z.coerce.number().int().min(1).max(3650).default(30), // y las otras tres RETENTION_*_DAYS (corte 9)
    DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().min(1).default(5000),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  // La pasarela simulada aprueba cualquier tarjeta: en producción hay que elegir un proveedor de verdad
  .refine((e) => !(e.NODE_ENV === 'production' && e.PAYMENT_PROVIDER === 'fake'), {
    path: ['PAYMENT_PROVIDER'],
    message: 'PAYMENT_PROVIDER=fake aprueba cualquier tarjeta y no puede usarse en producción: configura PAYMENT_PROVIDER=external y PAYMENT_API_URL',
  })
  .refine((e) => e.PAYMENT_PROVIDER !== 'external' || Boolean(e.PAYMENT_API_URL), {
    path: ['PAYMENT_API_URL'],
    message: 'PAYMENT_API_URL es obligatoria con PAYMENT_PROVIDER=external',
  });

export type Env = z.infer<typeof envSchema>;
```

`ConfigModule` guarda el objeto que devuelve `validate` (ver `AppModule`), así que `config.get('PORT')` ya es un número. `ConfigService.get<number>` por sí solo **no** convierte: el tipo genérico solo le indica a TypeScript qué esperar. Si una variable es inválida, la app no arranca y el error dice cuál.
