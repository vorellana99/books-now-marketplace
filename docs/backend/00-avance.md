# Backend: control de avance

> Seguimiento de la implementación de `apps/main-api` según las fases de la guía. Se actualiza en cada commit que avance una tarea: marca la casilla, anota lo que cambió respecto a la guía y deja una línea en la [bitácora](#bitácora).

**Leyenda:** ⬜ pendiente · 🔄 en curso · ✅ hecho · ⛔ bloqueado

Los cortes 0 a 4 traen un cuadro de **Tareas** que explica qué es cada una y para qué sirve; debajo queda la lista de casillas con el detalle. Al terminar una tarea de un corte en curso, se marca en las dos. Los commits de cada tarea llevan su número (`2.7`, `3.1`…).

## Resumen

| # | Corte | Fases de la guía | Estado | Rama | PR |
|---|---|---|---|---|---|
| 0 | Scaffold del proyecto | 0 | ✅ | `feature/initial` | — |
| 1 | Fundaciones | 1 | ✅ | `claude/gifted-brown-gqfpwp` | — |
| 2 | Dominio de Ventas | 2–3 | ✅ | `feature/corte-2-dominio-ventas` | — |
| 3 | Catálogo e Inventario | 4–5 | ✅ | `feature/corte-3-catalogo-inventario` | — |
| 4 | Outbox | 6 | 🔄 | `feature/corte-4-outbox` | — |
| 5 | Compra completa | 7–9 | ⬜ | — | — |
| 6 | Funcionalidades siguientes | 10–14 | ⬜ | — | — |
| 7 | Autenticación | 15 | ⬜ | — | — |

Los cortes 1 y 2 son independientes y pueden ir en paralelo. Del 3 en adelante, cada uno depende del anterior. Una rama y un pull request por corte, partiendo de `develop`.

**Un corte está terminado cuando:** sus tareas están marcadas, `pnpm lint` y `pnpm test` pasan, sus criterios de "listo cuando…" se cumplen ejecutándolos de verdad, y la guía refleja lo que realmente se hizo.

---

## Corte 0: Scaffold ✅

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Proyecto Nest 12 en ESM | El esqueleto de la API en `apps/main-api` | Tener una app que compila y arranca | ✅ |
| 2 | TypeScript 6, Vitest 4 y Vite 8 | El compilador y las herramientas de pruebas | Poder escribir y ejecutar tests | ✅ |
| 3 | oxlint y Prettier | El análisis de código y el formato | Detectar errores y mantener un estilo único | ✅ |
| 4 | `supertest` | Librería para hacer peticiones HTTP en los tests | Probar la API completa (e2e) | ✅ |
| 5 | pnpm | El gestor de paquetes | Instalaciones reproducibles con un lockfile | ✅ |

- [x] Proyecto Nest 12 en ESM (`apps/main-api`)
- [x] TypeScript 6, Vitest 4, Vite 8
- [x] oxlint (`--type-aware`) y Prettier
- [x] `supertest` y `@types/supertest`
- [x] Gestor de paquetes: pnpm

El "Hello World" del scaffold (`AppController`, `AppService` y sus tests) se eliminó en el corte 1.

---

## Corte 1: Fundaciones ✅

**Guía:** [01-decisiones-y-stack](01-decisiones-y-stack.md) · [02-estructura-y-puesta-en-marcha](02-estructura-y-puesta-en-marcha.md) · [03-base-de-datos](03-base-de-datos.md) · [05-piezas-clave](05-piezas-clave.md)

**Listo cuando:** `docker compose up` y `pnpm run start:dev` levantan; `/health/ready` y `/docs` responden con el header `X-Request-Id`, y los logs incluyen el `requestId` (campo en JSON en producción, prefijo en texto en desarrollo).

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Dependencias, entorno y scripts | Las librerías de la guía, `.env` / `.env.example`, `.gitignore` y los scripts `db:*`, `prisma:generate` y `test:e2e` | Poder instalar, configurar y arrancar el proyecto con comandos cortos | ✅ |
| 2 | Base de datos local | `docker-compose.yml` con PostgreSQL 18 y `healthcheck` | Tener la misma base en todas las máquinas con `pnpm run db:up` | ✅ |
| 3 | Configuración validada | `env.schema.ts` con Zod y el `ConfigModule` | Que la app no arranque con variables faltantes o inválidas, y que diga cuál | ✅ |
| 4 | Prisma y esquema | `prisma.config.ts`, `schema.prisma` (4 schemas), la migración `init` con los `CHECK` y `uuidv7()`, `PrismaModule` y `PrismaService` | Tener las tablas creadas y un cliente de base de datos listo para usar | ✅ |
| 5 | Errores de dominio y filtro HTTP | `domain.errors.ts`, `DomainExceptionFilter` y `configure-app` | Que un error de negocio responda 404, 409 o 422 en lugar de un 500 | ✅ |
| 6 | Observabilidad | `request-context`, middleware de `X-Request-Id`, interceptor y `RequestAwareLogger` | Seguir una petición por todos sus logs con un solo identificador | ✅ |
| 7 | Salud y documentación de la API | `/health/live`, `/health/ready`, Swagger en `/docs`, nuevo `main.ts` y `AppModule`; se elimina el "Hello World" | Saber si la API y la base están vivas, y poder explorar los endpoints | ✅ |
| 8 | Verificación | Tests de `env.schema` y e2e de `X-Request-Id`; comprobar que TypeScript 6, Vitest 4 y Prisma 7 funcionan juntos | Confirmar que los cimientos funcionan antes de construir encima | ✅ |

- [x] Instalar las dependencias de la guía (`pnpm add -E …`, Prisma fijado en `^7`)
- [x] `docker-compose.yml` con PostgreSQL 18 y `healthcheck`
- [x] `.env` y `.env.example`; agregar `/src/platform/prisma/generated/` al `.gitignore`
- [x] Scripts: `db:*`, `prisma:generate`, `prebuild`, `pretest`; `test:e2e` con `prisma generate`
- [x] `platform/config/env.schema.ts` y `ConfigModule` con validación Zod
- [x] `prisma.config.ts` y `prisma/schema.prisma` completo (schemas `sales`, `catalog`, `inventory`, `messaging`)
- [x] Migración `init` con los `CHECK` a mano (`charged_amount >= 0`, `price > 0`…) y `uuidv7()`
- [x] `PrismaModule` y `PrismaService` (cliente importado desde la carpeta generada)
- [x] `shared-kernel/domain.errors.ts` (lo necesita el filtro HTTP; se adelanta desde el corte 2)
- [x] `platform/observability/`: `request-context`, middleware, interceptor y `RequestAwareLogger`
- [x] `platform/http/`: `configure-app` y `DomainExceptionFilter`
- [x] `platform/health/`: `live` y `ready` (`/health/outbox` llega en el corte 4)
- [x] Swagger en `/docs`, nuevo `main.ts` (puerto desde `ConfigService`) y nuevo `AppModule`
- [x] Eliminar el "Hello World" del scaffold
- [x] Tests: validación de `env.schema` y e2e de `X-Request-Id`
- [x] Verificar que TypeScript 6, Vitest 4 y Prisma 7 funcionan juntos

---

## Corte 2: Dominio de Ventas ✅

**Guía:** [05-piezas-clave](05-piezas-clave.md) · [06-tests](06-tests.md) · [producto](../producto.md) (reglas del negocio)

**Listo cuando:** `contracts/` no importa nada de `contexts/`, y las invariantes del dominio tienen tests unitarios que pasan, sin base de datos.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | `Isbn` y `DomainEvent` | El identificador del libro y la forma base de un evento | Que un ISBN inválido no pueda existir en el sistema | ✅ |
| 2 | `contracts/` | Los mensajes públicos que se envían entre Ventas, Catálogo e Inventario | Que los contextos hablen sin importar el código interno del otro | ✅ |
| 3 | `Money` y `Specification` | El dinero exacto (decimal.js) y la base de las reglas combinables | Que los totales no tengan errores de redondeo | ✅ |
| 4 | `Order`, `OrderLine` y `OrderFactory` | El pedido y sus líneas | Reglas de pedido: máximo 10 por libro, una sola moneda, líneas repetidas sumadas | ✅ |
| 5 | `Customer` y `Email` | El cliente y su correo | Saber si el cliente es premium | ✅ |
| 6 | `PricingService` y las specifications | El cálculo del total | Descuento, envío y total: S/ 110, 160, 90 y 180 de la tabla del producto | ✅ |
| 7 | Puertos (`abstract class`) | Los "enchufes" que el dominio necesita: repositorios, pago, stock y notificación | Que el dominio no dependa de Prisma ni de Nest | ✅ |
| 8 | `test/fakes/` | Versiones en memoria de esos puertos | Probar la saga sin base de datos | ✅ |
| 9 | Regla de dependencias | Un test que revisa los imports | Que `domain/` quede sin Nest ni Prisma y `contracts/` sin `contexts/` | ✅ |
| 10 | Reglas de precio por moneda | Una tabla con el mínimo de envío gratis y el costo de envío de cada moneda | Que un pedido en dólares se cobre bien, con sus propios valores (40.00 USD y 3.00 USD) | ✅ |

- [x] `shared-kernel/`: `isbn.vo.ts` y `domain-event.ts`
- [x] `contracts/`: `order-placed.event`, `get-book-price.query`, `reserve-stock.command`, `release-stock.command`, `stock.errors`
- [x] `sales/domain/shared/`: `money.vo.ts` (decimal.js) y `specification.ts`
- [x] `sales/domain/order/`: agregado `Order`, `OrderLine`, `OrderFactory`
- [x] `sales/domain/customer/`: agregado `Customer`, `email.vo.ts`
- [x] `sales/domain/pricing/`: `PricingService`, `PricingContext` y las specifications
- [x] Puertos como `abstract class`: `OrderRepository`, `CheckoutLog`, `CatalogPricing`, `StockReservation`, `Notifier`, `PaymentGateway`, `CustomerRepository`
- [x] `test/fakes/`
- [x] Tests: `money.vo`, `order.aggregate`, `pricing.service` (ejemplos de la tabla de totales del producto)
- [x] Regla de dependencias comprobada (`domain/` sin Nest ni Prisma)
- [x] Reglas de precio por moneda: `PEN` (150.00 y 10.00) y `USD` (40.00 y 3.00)

---

## Corte 3: Catálogo e Inventario ✅

**Guía:** [05-piezas-clave](05-piezas-clave.md) · [03-base-de-datos](03-base-de-datos.md) · [06-tests](06-tests.md)

**Listo cuando:** `GET /books/:isbn` responde; reservar sin stock lanza `OutOfStockError` y no cambia nada; los tests contra PostgreSQL real pasan.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Entorno de integración con Testcontainers | Un `globalSetup` que levanta `postgres:18`, aplica las migraciones y entrega las variables `DB_*`; los archivos de integración se ejecutan uno tras otro porque comparten la base; limpieza de tablas entre tests y tiempos de espera mayores | Probar contra PostgreSQL real sin que los tests se pisen entre sí | ✅ |
| 2 | CI y documentación de pruebas | El workflow sin el servicio `postgres` ni `db:deploy`, y el README (Requisitos, Pruebas y "Base de datos aparte para las pruebas") | Que el repositorio quede coherente justo después de cambiar cómo se prueba | ✅ |
| 3 | Seed | `prisma/seed.ts` con clientes (normal y premium), libros (en PEN, en USD, uno inactivo y uno sin registro de stock) y stock (uno en cero) | Poder probar la API a mano con `pnpm run db:seed`, incluidos los tres casos de stock | ✅ |
| 4 | Catálogo: `GetBookPriceHandler` | El handler de la query de precio, con Prisma directo, y las ayudas para crear libros y stock en los tests | Que Ventas pueda pedir título y precio de un libro por el contrato | ✅ |
| 5 | Catálogo: `GET /books/:isbn` | `BookController` (envía `GetBookPriceQuery` por el `QueryBus`), `CatalogModule` en `AppModule` y Swagger | Que la API publique el libro, con un solo camino y un solo formato de error | ✅ |
| 6 | Inventario: `ReserveStockHandler` | Reservar todas las líneas o ninguna, con una actualización condicional, y rechazo de entradas inválidas | Que el stock nunca quede en negativo | ✅ |
| 7 | Inventario: `ReleaseStockHandler` | Devolver el stock de un pedido, de forma idempotente | Que compensar la saga no devuelva stock de más | ✅ |
| 8 | Concurrencia sin interbloqueo | Tests con pedidos simultáneos que reservan los mismos libros en orden inverso | Demostrar que el bloqueo por orden de ISBN evita los interbloqueos | ✅ |
| 9 | Cableado y cierre | `InventoryModule` en `AppModule`, prueba a través del `CommandBus` y el `QueryBus`, regla de dependencias para `application/` y guía al día | Cerrar el corte con los criterios "listo cuando" cumplidos de verdad | ✅ |
| 10 | Reservas simultáneas del mismo pedido | Un bloqueo por pedido al inicio de la reserva | Que un pedido reserve una sola vez aunque dos llamadas a la vez usen libros distintos | ✅ |

**Decisiones** (se aplicó la opción propuesta en las cinco; si alguna no convence, cambiarla es una tarea pequeña):

1. **Base de los tests de integración:** Testcontainers (como pide la guía), no la base de desarrollo. El servicio `postgres` del workflow pasa a sobrar y se quita en la tarea 2.
2. **Aislamiento entre archivos de test:** un solo contenedor con los archivos de integración ejecutados uno tras otro (simple y suficiente con pocos archivos). La alternativa, una base por archivo, es más rápida pero más compleja.
3. **ISBN con formato inválido en `GET /books/:isbn`:** `422 INVALID_ISBN`, que amplía el contrato (hoy solo lista `404`).
4. **Reservar dos veces el mismo pedido:** un `ConflictError` claro en vez del error de clave duplicada de la base. La saga no debería llegar ahí.
5. **Datos del seed:** títulos y precios de ejemplo inventados (por ejemplo, uno a 45.00 PEN y otro a 15.00 USD).

**Riesgos:** Docker es obligatorio para `test:e2e` (se avisa con un mensaje claro y `pnpm test` sigue sin Docker); las pruebas de concurrencia pueden ser inestables, así que se repiten en rondas y se comprueba que fallan si se rompe el código a propósito; el arranque del contenedor necesita tiempos de espera mayores en Vitest; los pasos del CI no se pueden ejecutar fuera de GitHub, así que se simulan en local sobre una copia limpia, como en el corte 1.

- [x] 3.1 Testcontainers con `postgres:18` y `vitest.config.e2e.ts` (`test/{integration,e2e}/**/*.spec.ts`): `globalSetup`, migraciones, archivos en serie y limpieza entre tests. Se comprueba: los 7 e2e actuales pasan sobre el contenedor sin `db:up`; dos archivos que escriben en las mismas tablas no se pisan; falla con un mensaje claro si Docker no está activo
- [x] `vitest.config.ts` solo con `test/unit/**/*.spec.ts` (ya estaba hecho desde el corte 1)
- [x] 3.2 Workflow de CI sin el servicio `postgres` y README al día. Se comprueba: los pasos del workflow, ejecutados en local sobre una copia limpia, pasan, y los comandos del README funcionan tal como están escritos
- [x] 3.3 `prisma/seed.ts`: clientes, libros y stock de ejemplo. Se comprueba: ejecutarlo dos veces no duplica nada; los ISBN son válidos, cumplen los `CHECK` y hay un libro de cada caso (con stock, sin stock y sin registro de stock)
- [x] 3.4 `GetBookPriceHandler` (monto como `{ amount, currency }`) y ayudas para crear datos de prueba. Se comprueba: libro en PEN y en USD con el precio en texto de 2 decimales; inexistente o inactivo da `NotFoundError`
- [x] 3.5 `CatalogModule`: `BookController` (`GET /books/:isbn`). Se comprueba: e2e con 200, 404, 422 y `X-Request-Id`, y una petición real con `curl`
- [x] 3.6 `ReserveStockHandler`. Se comprueba: reserva correcta; sin stock da `OutOfStockError` y no cambia nada, ni las líneas anteriores; un libro sin registro da `StockItemNotFoundError`; sin líneas, ISBN repetido o cantidad menor a 1 dan un error de dominio y no el de la base
- [x] 3.7 `ReleaseStockHandler`. Se comprueba: liberar dos veces (también en simultáneo) devuelve el stock una sola vez; un pedido sin reserva no hace nada
- [x] 3.8 Tests de `stock.handlers`: dos pedidos con los mismos libros en orden inverso reservan a la vez sin interbloqueo. Se comprueba: muchas rondas sin error, y quitar el orden de ISBN hace fallar el test
- [x] 3.9 `InventoryModule` y `CatalogModule` en `AppModule`, prueba por el bus, regla de dependencias de `application/` sin Prisma (hoy sin código que revisar: se prueba con archivos de ejemplo) y guía al día. Se comprueba: `GET /books/:isbn` responde y reservar sin stock lanza `OutOfStockError`
- [x] 3.10 Bloqueo por pedido en `ReserveStockHandler` (`pg_advisory_xact_lock`). Se comprueba: dos reservas simultáneas del mismo pedido con libros distintos dan una reserva y un `ConflictError`; pedidos distintos siguen reservando a la vez, sin esperarse

---

## Corte 4: Outbox 🔄

**Guía:** [05-piezas-clave](05-piezas-clave.md) (Platform: el Outbox) · [06-tests](06-tests.md)

**Listo cuando:** los tests de integración del Outbox pasan, incluido el del `correlationId`.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Consumidores y registro | `outbox-consumer.ts` (consumidor `db` y `external`), `@OutboxHandler()` y `OutboxRegistry` | Que el sistema sepa qué consumidores existen y a qué evento responde cada uno | ✅ |
| 2 | `OutboxWriter` | `append(tx, events)`: guarda el evento y una entrega por consumidor | Que el evento se guarde en la misma transacción que el pedido | ✅ |
| 3 | Relay: reclamar y entregar | `runOnce()`: reclama con `SKIP LOCKED`, entrega y marca `DONE`, con consumidores `db` y `external` | Que cada evento llegue a su consumidor y quede marcado | ✅ |
| 4 | Relay: fallos y reintentos | Retroceso exponencial, `last_error` y paso a `FAILED` | Que un consumidor que falla no se pierda ni bloquee a los demás | ⬜ |
| 5 | Relay: concurrencia | `SKIP LOCKED`, bloqueo vencido y *fencing* por `attempts` | Que dos instancias no entreguen lo mismo y una lenta no pise a otra | ⬜ |
| 6 | Ciclo de vida del relay | `tick()` con una vuelta a la vez, `isAlive()` y apagado ordenado | Que el relay corra solo, se sepa si está vivo y se detenga sin dejar entregas a medias | ⬜ |
| 7 | Salud del Outbox | `OutboxHealthIndicator` y `GET /health/outbox` | Que monitoreo sepa si el relay sigue vivo y cuántas entregas fallan | ⬜ |
| 8 | Cableado y cierre | `OutboxModule` en `AppModule`, prueba con el intervalo real, README operativo, CI y guía | Cerrar el corte con el "listo cuando" cumplido de verdad | ⬜ |

**Decisiones** (se aplica la opción propuesta; si alguna no convence, se cambia antes de llegar a esa tarea):

1. **Reloj de los reintentos:** el de la base de datos (`now()` en SQL), igual que el bloqueo, y no `Date.now()` de la aplicación como en la guía. Evita que un desfase entre relojes adelante o retrase un reintento.
2. **Apagado ordenado:** al cerrar la app, el relay espera la vuelta en curso (con un tope). La guía no lo prevé; sin él, una entrega a medias queda bloqueada hasta que venza el bloqueo de 2 minutos.
3. **Orden de entrega por id del evento (uuidv7), como la guía.** Límite conocido: dos transacciones del mismo pedido podrían confirmar en orden distinto al de sus ids. Hoy solo existe `OrderPlaced` (un evento por pedido), así que no afecta; se documenta.
4. **`ScheduleModule` se queda en `AppModule`,** no dentro de `OutboxModule`, para que los tests construyan el relay sin intervalo y lo manejen a mano con `runOnce()` y `tick()`.
5. **Un evento `FAILED` no frena los siguientes del mismo pedido y consumidor,** como en la guía.

**Riesgos:** las pruebas de concurrencia pueden ser inestables, así que se hacen sin esperas reales (consumidores que se detienen hasta que el test los libera, y bloqueos vencidos con SQL en vez de esperar 2 minutos), se repiten y se comprueba que fallan si se rompe el código; al registrar el relay, el e2e de "BD caída" lo vería fallar cada segundo y habrá que ajustarlo; una instancia entrega unos 10 eventos por segundo, que sobra para esta tienda y escala con más instancias. Los commits solo se hacen si todos los chequeos pasan.

- [x] 4.1 `outbox-consumer.ts`, `@OutboxHandler()` y `OutboxRegistry`. Se comprueba: descubre los consumidores decorados; un nombre duplicado impide arrancar; un evento sin consumidores da una lista vacía
- [x] 4.2 `OutboxWriter` (`append(tx, events)`). Se comprueba: si se revierte la transacción de quien llama, no queda evento ni entregas; no abre transacción propia; guarda el `correlationId`; ignora los eventos sin consumidores
- [x] 4.3 `OutboxRelay` (`runOnce`: `SKIP LOCKED`, orden por agregado). Se comprueba: entrega y marca `DONE`; el efecto `db` y `DONE` se confirman juntos; el consumidor `external` corre sin transacción abierta; restauración de `correlationId`
- [ ] 4.4 Fallos y reintentos del relay. Se comprueba: reintenta con retroceso y tras agotar los intentos queda `FAILED` con su motivo; el SQL de reprocesar de la guía funciona
- [ ] 4.5 Concurrencia del relay (bloqueo vencido y *fencing* por `attempts`). Se comprueba: entrega única con dos relays; un bloqueo vencido se retoma; la instancia lenta no pisa el `DONE` de la otra y revierte su efecto `db`
- [ ] 4.6 `tick()`, `isAlive()` y apagado ordenado del relay. Se comprueba: sin vueltas solapadas; un error no mata el intervalo; `isAlive` con reloj controlado
- [ ] 4.7 `OutboxHealthIndicator` y `GET /health/outbox`. Se comprueba: 200 con el relay vivo y 503 si está detenido; `failed` y `due` en el detalle; una `FAILED` antigua no lo pone en rojo
- [ ] 4.8 `OutboxModule` registrado en `AppModule`, README operativo, CI y guía. Se comprueba: un evento escrito con `append` llega solo a su consumidor con el intervalo real, con el `correlationId` en sus logs

---

## Corte 5: Compra completa ⬜

**Guía:** [04-flujo-pedido-y-saga](04-flujo-pedido-y-saga.md) · [05-piezas-clave](05-piezas-clave.md) · [api-contrato](../api-contrato.md) · [06-tests](06-tests.md)

**Listo cuando:** `POST /orders` devuelve 201 con saga e idempotencia; tras la compra, el email aparece en el log, la reserva queda `CONFIRMED` y `/health/outbox` responde 200; los e2e pasan (flujo feliz, sin stock, pago rechazado).

- [ ] `PrismaCheckoutLog` y `PrismaOrderRepository` (pedido + checkout + outbox en una transacción) con `OrderMapper`
- [ ] Adaptadores: `CatalogInProcessAdapter`, `InventoryInProcessAdapter`, `ConsoleNotifier`
- [ ] `FakePaymentGateway` y `ExternalPaymentAdapter` (timeout de 10 s)
- [ ] `PlaceOrderHandler` con compensaciones e idempotencia
- [ ] `OrderController`, `PlaceOrderDto` y `GetOrderHandler` (`GET /orders/:id`)
- [ ] `RecoverCheckoutsJob`
- [ ] Consumidores: `SendOrderConfirmationConsumer` y `ConfirmReservationConsumer`
- [ ] `SalesModule` y conexión en `AppModule`
- [ ] Tests unitarios del handler (rechazo de pago, timeout, commit ambiguo, reintento con la misma clave, hash)
- [ ] Tests de integración de recuperación de checkouts
- [ ] e2e de `orders` (incluye dos `POST` simultáneos con la misma clave y el `X-Request-Id`)

---

## Corte 6: Funcionalidades siguientes ⬜

**Guía:** [07-fases-y-roadmap](07-fases-y-roadmap.md)

- [ ] Fase 10: buscar y listar libros
- [ ] Fase 11: dirección de envío (`OrderPlacedEvent` v2)
- [ ] Fase 12: administración de libros y precios (con `AdminApiEnabledGuard`)
- [ ] Fase 13: carga de stock
- [ ] Fase 14: historial de pedidos

## Corte 7: Autenticación ⬜

- [ ] Fase 15: contexto de Identidad, roles y `customerId` desde el token. **Bloquea el despliegue público.**

---

## Decisiones y desvíos respecto a la guía

Cuando la implementación se aparte de la guía, se anota aquí y se corrige la guía en el mismo commit.

| Fecha | Corte | Qué cambió | Por qué |
|---|---|---|---|
| 2026-10-27 | 1 | `env.schema.ts` usa `z.url()` en vez de `z.string().url()` | Zod 4 (`4.6.7`) marca la forma antigua como obsoleta |
| 2026-10-27 | 1 | Prisma queda fijado en `7.10.1` exacto (`prisma`, `@prisma/client`, `@prisma/adapter-pg`) | La guía pide `-E`, pero con un rango `^7` pnpm deja el `^` |
| 2026-10-27 | 1 | Se agregó `apps/main-api/pnpm-workspace.yaml` con la lista de scripts de instalación permitidos (`prisma`, `@prisma/engines`, `esbuild`) | pnpm más nuevo que el 10.28 falla con `ERR_PNPM_IGNORED_BUILDS` en `pnpm install`; en pnpm 10.28 solo avisaba |
| 2026-10-27 | 1 | `GET /health/ready` devuelve el detalle de terminus (`{ status, info, error, details }`) | Es lo que produce `HealthCheckService`; la guía solo pedía 200/503 |
| 2026-10-27 | 1 | `shared-kernel/domain.errors.ts` se creó en el corte 1 | Lo necesita `DomainExceptionFilter` |
| 2026-10-27 | 1 | PostgreSQL con Docker se publica en el puerto **5433** (`ports: ["5433:5432"]`), no en el 5432 de la guía original | Decisión del equipo: no chocar con un PostgreSQL local. Cambian `docker-compose.yml`, `.env.example` y la guía |
| 2026-10-27 | 1 | `DATABASE_URL` se sustituye por cinco variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). La URL se arma en `platform/config/database-url.ts`, que usan `PrismaService` y `prisma.config.ts` | Una URL con una contraseña larga era difícil de leer y editar; así la contraseña se codifica sola y `docker-compose.yml` lee las mismas variables |
| 2026-10-27 | 1 | `RequestAwareLogger` escribe JSON solo con `NODE_ENV=production`; en desarrollo usa texto con colores y el `requestId` como prefijo `[id]` | Los logs JSON eran difíciles de leer en el terminal. En producción siguen siendo JSON para las herramientas de logs |
| 2026-10-27 | 1 | Al arrancar fuera de producción se imprime un banner con las URLs (API, `/docs`, `/health/ready`), el entorno y la base (`startup-banner.ts`). En producción se emite un log JSON equivalente | Ver de un vistazo dónde quedó escuchando la API y con qué configuración |
| 2026-10-27 | 1 | `pnpm-workspace.yaml` fuerza `multer` a `>=2.5.0 <3` con `overrides` | `pnpm audit` marcaba una vulnerabilidad alta (GHSA-q7qp-rjg7-q26m). `@nestjs/platform-express` 12.3.2 ya exige 2.5.0, pero salió hoy y pnpm bloquea versiones tan recientes. Quitar el override cuando se pueda actualizar |
| 2026-10-27 | 2 | Los comandos y la query de `contracts/` extienden `Command<T>` y `Query<T>` de `@nestjs/cqrs`, y `GetBookPriceQuery` declara su propio `CurrencyCode` en vez de importar `Currency` de Ventas | Así el bus infiere el tipo de la respuesta, y un contrato no puede depender del código interno de ningún contexto |
| 2026-10-27 | 2 | `money.vo.ts` importa `{ Decimal }` de `decimal.js` (con nombre) en vez de `import Decimal from …`. Además `Money.of` rechaza textos que no son un número finito (`INVALID_AMOUNT`) y `add` / `multiply` pasan por `Money.of`, así que un resultado negativo falla | Con `module: nodenext` el import por defecto no tiene tipos y `tsc` falla. Los otros dos cambios mantienen la invariante "un `Money` nunca es negativo ni inválido" |
| 2026-10-27 | 2 | El pedido nace en estado `DRAFT` y pasa a `PLACED` con `place()`. Reglas con código propio: `INVALID_QUANTITY`, `MAX_QUANTITY_EXCEEDED` (10 por libro, sumando líneas repetidas), `CURRENCY_MISMATCH`, `EMPTY_ORDER`, `ORDER_ALREADY_PLACED` y `PRICE_MISMATCH`. `PricedCartItem` vive en `order.factory.ts` | La guía v5 no incluye el código del agregado. `PRICE_MISMATCH` es una regla añadida: el mismo libro con dos precios en un carrito (por ejemplo, si el precio cambia entre dos consultas al catálogo) falla en vez de cobrar con un precio arbitrario. Los códigos se listan en `api-contrato.md` |
| 2026-10-27 | 2 | `Customer` se crea con `Customer.create(id, email, premium = false)` y `isPremium` es de solo lectura: no hay operación para volverlo premium. `Email` normaliza (sin espacios, en minúsculas) y valida con `INVALID_EMAIL` | `producto.md` dice que premium "se marca en la BD; aún no hay forma de suscribirse", así que añadir un método sería código sin uso. La misma `create` sirve para reconstruir el cliente desde la BD en el corte 5 |
| 2026-10-27 | 2 | `FreeShippingSpec` = `MinimumSubtotalSpec(150.00)` o `PremiumCustomerSpec`, y se exporta como `freeShippingSpec`. `PremiumOfferSpec` (¿aplica el descuento?) hoy delega en `PremiumCustomerSpec`. `PricingService.calculateFinalPrice(order, customer, freeShipping)` devuelve el importe **sin redondear** (descuento con `multiply('0.90')`, envío `Money.of('10.00')`) | La guía v5 no incluye el código de las specifications. Se siguen las firmas que usa el handler de la saga y las reglas de `producto.md`. El redondeo lo hace el handler una sola vez con `toFinal()` |
| 2026-10-27 | 2 | Los siete puertos viven donde indica la estructura (`order/`, `customer/`, `payment/`). Cada puerto declara sus tipos de apoyo: `CheckoutRecord` y `CheckoutStatus`, `PaymentResult`, `CartItem` y `StockLine`. `Customer` expone `email`, no `currentEmail`: se corrige el consumidor de email de la guía | Mantener cada tipo junto al puerto que lo usa. `PricedCartItem` sigue en `order.factory.ts` y `CatalogPricing` lo importa |
| 2026-10-27 | 2 | Los fakes de `test/fakes/` siguen los nombres de los ejemplos de `06-tests.md` y añaden opciones para los casos de la saga: `FakeStockReservation({ outOfStock })`, `FakePaymentGateway({ approved, reason, timeout, refundFails })`, `InMemoryOrderRepository({ failOnSave, failAfterCommit })`, `InMemoryCheckoutLog` (con `statusOf`, `backdate` y reclamos con bloqueo de 5 min) y `FakeNotifier({ fails })`. Se importan desde `test/fakes/index.ts` | Los fakes imitan la idempotencia de lo real (liberar y reembolsar no repiten) para que los tests del handler no pasen por una comodidad que la implementación real no tiene |
| 2026-10-27 | 2 | La regla de dependencias es un test (`dependency-rules.spec.ts` con `test/support/architecture.ts`) y es más estricta que la guía: `domain/` solo admite `decimal.js` y `node:*` (una lista de permitidos, no de prohibidos), y `contracts/` solo `@nestjs/cqrs`. Cubre también `shared-kernel/` y los imports entre contextos, y distingue a `app.module` y `main.ts`, que sí ensamblan los contextos | Una lista de permitidos obliga a autorizar conscientemente cada librería nueva. El verificador se prueba con archivos de ejemplo que rompen las reglas, para que no pase en vacío si una ruta cambia |
| 2026-10-27 | 2 | Los importes de envío tienen valores propios por moneda en `pricing-rules.ts` (`PRICING_RULES`): `PEN` 150.00 de mínimo y 10.00 de envío, `USD` 40.00 y 3.00. No hay conversión. `FreeShippingSpec` y `PricingService` leen la regla de la moneda del pedido, y una moneda sin reglas falla con `UNSUPPORTED_CURRENCY`. Se eliminan las constantes `FREE_SHIPPING_MINIMUM` y `SHIPPING_COST` | Decisión de negocio: los valores en USD (40.00 y 3.00) se eligieron por equivalencia aproximada con los de soles, con un cambio de referencia de unos 3.7 S/ por USD; conviene confirmarlos con el negocio. El descuento premium es un porcentaje y no cambia |
| 2026-10-27 | 3 | `test:e2e` ya no usa la base de desarrollo: `globalSetup` levanta `postgres:18` con Testcontainers, aplica `prisma migrate deploy` y define `DB_*` (tienen prioridad sobre `.env`). Los archivos corren uno tras otro (`fileParallelism: false`). `resetDatabase()` solo opera si el `globalSetup` marcó la base como suya (`INTEGRATION_DB_CONTAINER`) | Los tests de integración vacían tablas y no deben poder llegar a los datos de desarrollo. El README y el CI se ajustan en la tarea 3.2 |
| 2026-10-27 | 3 | El seed (`prisma/seed.ts` con los datos en `seed-data.ts`) usa títulos y autores reales con precios y stock inventados (decisión 5), y es idempotente: restaura clientes y catálogo, pero **no pisa el stock existente** (`update: {}`). `lint`, `format` y `format:check` incluyen ahora `prisma/` | Que repetir el seed no borre las reservas hechas al probar. Antes el código de `prisma/` no pasaba por el lint ni el formato |
| 2026-10-27 | 3 | `CatalogModule` se crea ya en la 3.4 con solo el handler (el controlador y su alta en `AppModule` llegan en la 3.5), para poder probar el handler por el `QueryBus`. Los tests usan `createTestApp()` (`test/support/nest.ts`) y `insertBook()` / `insertStock()` (`test/support/builders.ts`), que insertan con SQL directo en vez de con el código bajo prueba | Un handler probado con el mismo cliente que lo implementa puede esconder sus propios fallos. `GetBookPriceHandler` trata un libro inactivo como inexistente (`NotFoundError`) |
| 2026-10-27 | 3 | `GET /books/:isbn` valida el ISBN con `Isbn.create` y responde `422 INVALID_ISBN` si está mal formado (decisión 2), lo que amplía el contrato; el ISBN con guiones se normaliza antes de consultar. El controlador envía `GetBookPriceQuery` por el `QueryBus`, igual que Ventas. La configuración de Swagger sale de `main.ts` a `platform/http/configure-swagger.ts` | Un solo camino de lectura y un solo formato de error. Extraer Swagger permite probar en e2e que `/docs-json` documenta el endpoint |
| 2026-10-27 | 3 | `ReserveStockHandler` valida las entradas antes de abrir la transacción (`EMPTY_RESERVATION`, `DUPLICATE_RESERVATION_LINE`, `INVALID_QUANTITY`) y rechaza reservar dos veces el mismo pedido con `ConflictError` `ORDER_ALREADY_RESERVED` (decisión 4), tanto por una comprobación previa como al traducir la clave duplicada `P2002`. El orden de bloqueo vive en `lock-order.ts` (`sortByIsbn`) y compara texto simple en vez de `localeCompare` | Los errores crudos de la base (`CHECK`, clave duplicada) no deben llegar al cliente. Un orden que dependiera del idioma del sistema podría diferir entre instancias y reintroducir interbloqueos. La carrera de dos reservas del mismo pedido con ISBN distintos a la vez no quedaba cubierta; se cerró en la tarea 3.10 |
| 2026-10-27 | 3 | La reserva y la liberación validan que el `orderId` sea un UUID (`INVALID_ORDER_ID`). La liberación solo toca reservas `HELD`, devuelve el stock con `DELETE … RETURNING` en una transacción y, si una línea no se puede devolver, no libera ninguna | Un texto cualquiera en una columna `uuid` llegaba como error crudo de la base; la validación se añadió también al reservar de la 3.6. Dejar una reserva sin liberar es mejor que liberarla a medias: la recuperación de checkouts puede reintentarla |
| 2026-10-27 | 3 | Los tests de interbloqueo usan `slowDownStockUpdates(ms)` (`test/support/database.ts`): un disparador de prueba que retrasa cada actualización de stock para que dos transacciones en orden distinto se crucen siempre. `resetDatabase()` lo quita si un test lo dejó puesto | Sin el retardo, operaciones de milisegundos casi nunca coinciden y la prueba pasaría aunque el orden de bloqueo estuviera mal. Con él, quitar el orden de `reserve`, de `release` o del helper compartido hace fallar los tests con interbloqueos reales de PostgreSQL |
| 2026-10-27 | 3 | `InventoryModule` y `CatalogModule` están en `AppModule`; antes los comandos de Inventario no tenían quién los atendiera en la aplicación real. La regla de dependencias suma que `application/` no usa Prisma (`@prisma/*` ni `platform/prisma`), aunque hoy ningún contexto tiene código ahí | Cierra el corte 3. La regla se probó añadiendo archivos de prueba con imports prohibidos en los contextos reales |
| 2026-10-27 | 3 | `ReserveStockHandler` toma un bloqueo de aviso por pedido (`pg_advisory_xact_lock` con una clave de dos enteros: el espacio `inventory.reserve-stock` y el hash del `orderId`) antes de la comprobación previa. Pedidos distintos no se esperan; una colisión de hash solo causaría una espera innecesaria | Cierra el hueco de la 3.6: con libros distintos, dos reservas del mismo pedido no competían por ninguna fila de stock ni chocaban en la clave primaria, así que las dos tenían éxito. Se demostró forzando el cruce con `slowDownStockUpdates` |
| 2026-10-27 | 4 | `OutboxRegistry` valida al arrancar cada consumidor decorado: `kind` (`db` o `external`), `name`, `event` y `handle()`, con un mensaje que nombra la clase. La guía solo detectaba nombres duplicados. `OutboxModule` importa `DiscoveryModule` y no `ScheduleModule` (decisión 4) | Un consumidor mal escrito (por ejemplo, sin `kind`) se descubriría tarde y fallaría al llegar su primer evento. Es mejor que impida arrancar |
| 2026-10-27 | 4 | Las columnas `TIMESTAMP(3)` de Prisma **no llevan zona horaria** y guardan la hora en UTC. Los valores que escribe la base con `now()` usan la zona de la sesión, y los que escribe Prisma con una `Date` de JavaScript, UTC; los dos coinciden solo si la base trabaja en UTC. Por eso la decisión 1 (reloj de la base para los reintentos) es obligatoria y no una preferencia. En los tests, el cliente `pg` lee esas columnas como UTC (`setTypeParser(1114)`), porque por defecto las desplaza según la zona de Node | Descubierto al escribir los tests del writer: una fecha guardada a las 00:17 UTC se leía como 05:17 en esta máquina (UTC−5). En producción, la base debería ejecutarse en UTC |
| 2026-10-27 | 4 | `OutboxRelay.runOnce()` reclama con la consulta de la guía (`SKIP LOCKED`, `NOT EXISTS` para el orden por pedido y consumidor, lote de 10, bloqueo de 2 minutos) y entrega a consumidores `db` (efecto y `DONE` en una transacción) y `external` (sin transacción abierta). `BATCH` y `LEASE_MS` se exportan. En esta tarea un error del consumidor aún sube sin tratarse: los fallos llegan en la 4.4 y el módulo no está conectado a la app hasta la 4.8 | Cada tarea se verifica sola. Que `DONE` y el efecto `db` van en la misma transacción solo se puede demostrar con un fallo en medio (la instancia lenta de la 4.5); mientras tanto, desde otra conexión se comprueba que ni el efecto ni `DONE` se ven hasta que el consumidor termina |

## Problemas abiertos

| Fecha | Corte | Problema | Estado |
|---|---|---|---|
| 2026-10-27 | 3 | Docker en el entorno en la nube: el daemon no está activo por defecto. Se levanta con `dockerd` en segundo plano y `postgres:18` se descarga bien. Falta comprobar Testcontainers | Docker ✅ · Testcontainers ✅ verificado en local (3.1); en el entorno en la nube sigue sin probarse |
| 2026-10-27 | 1 | El entorno en la nube tenía Node 22.22 (en local es 24.21); la guía pide Node 24 LTS (≥ 24.15). `engines` exige `>=24.15` y el workflow de CI usa Node 24 | ✅ Resuelto |
| 2026-10-27 | 1 | Los tests e2e necesitan la BD levantada (`pnpm run db:up`) y las variables `DB_*` definidas. El workflow `.github/workflows/main-api.yml` ya lo hace: levanta `postgres:18`, aplica las migraciones y corre los e2e. Falta ver su primera ejecución en GitHub | Parcial: workflow escrito, sin ejecutar en GitHub. Desde la 3.2 los e2e levantan su propio PostgreSQL (no usan el servicio `postgres`) |
| 2026-10-27 | 2 | Los pedidos en **USD** no se podían valorizar: las reglas de envío estaban fijas en soles. Se resolvió en la tarea 2.10 con una tabla de reglas por moneda | ✅ Resuelto |

## Bitácora

| Fecha | Qué se hizo |
|---|---|
| 2026-10-27 | Guía adaptada al estado de `apps/main-api` y dividida en `docs/` y `docs/backend/`. Se define este plan de cortes |
| 2026-10-27 | Arreglo tras probar en local: `pnpm install` fallaba con `ERR_PNPM_IGNORED_BUILDS` (se agrega `pnpm-workspace.yaml`) y el `pnpm-lock.yaml` estaba desactualizado respecto a las versiones fijadas de Prisma (regenerado) |
| 2026-10-27 | **Corte 1 terminado.** Dependencias, `docker-compose.yml` (PostgreSQL 18), schema Prisma con migración `init` (4 schemas, 9 tablas, `uuidv7()` y `CHECK`), config con Zod, `PrismaService`, observabilidad (`X-Request-Id`), filtro de dominio, health `live`/`ready`, Swagger en `/docs`. Se elimina el "Hello World". `pnpm lint`, `pnpm test` (11 tests) y `pnpm run test:e2e` (5 tests, contra PostgreSQL 18) pasan; la app arranca y responde |
| 2026-10-27 | Las variables `DB_*` reemplazan a `DATABASE_URL` (`database-url.ts` con tests, `docker-compose.yml` y READMEs). Banner de arranque y logs en texto con colores fuera de producción. Se corrigen la vulnerabilidad de `multer` (override en `pnpm-workspace.yaml`; `pnpm audit --prod` queda limpio) y el formato de `domain-exception.filter.ts`. Hoy: `pnpm lint` y `pnpm test` (16 tests) y `pnpm run test:e2e` (5 tests) pasan |
| 2026-10-27 | Se fija `"engines": { "node": ">=24.15" }` en `package.json` y el README pasa de "Node 22 o superior" a Node 24 LTS (≥ 24.15), como pide la guía |
| 2026-10-27 | Se añade el workflow de CI `.github/workflows/main-api.yml` (Node 24, pnpm 12.15, `postgres:18`): `prisma generate`, lint, formato, build, tests unitarios, `migrate deploy` y e2e, más un job `pnpm audit --prod` que falla con vulnerabilidades altas. Nuevo script `format:check`. Sus pasos se ejecutaron en local sobre una copia limpia con una base nueva y pasan; la primera ejecución real en GitHub sigue pendiente |
| 2026-10-27 | Tests nuevos del corte 1: `/health/ready` responde 503 con la BD caída (y `live` sigue en 200), el logger en modo texto antepone el `requestId`, el interceptor abre el contexto con el `requestId` y el banner de arranque. Se comprobó que cada uno falla al romper el código que protege. Hoy: 20 tests unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 1: `shared-kernel/isbn.vo.ts` (`Isbn.create` normaliza guiones y espacios, y valida 13 dígitos y el dígito de control; error `INVALID_ISBN`) y `domain-event.ts`. 11 tests nuevos; hoy 31 unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 2: `contracts/` con `OrderPlacedEvent` (v1, `aggregateId` real y montos en texto), `GetBookPriceQuery`, `ReserveStockCommand`, `ReleaseStockCommand` y `OutOfStockError` / `StockItemNotFoundError`. Solo dependen de `shared-kernel` y `@nestjs/cqrs`. 8 tests nuevos; hoy 39 unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 3: `Money` (decimal.js; `toFinal` redondea mitad hacia arriba, `Money.of('1.005').toFinal()` da `"1.01"`) y la base `Specification` con `and` / `or` / `not`. 33 tests nuevos; hoy 72 unitarios y 7 e2e pasan |
| 2026-10-27 | Se añade a los cortes 0, 1 y 2 un cuadro de tareas con "qué es" y "objetivo principal" |
| 2026-10-27 | Corte 2, tarea 4: `Order` (`addBook`, `subtotal`, `place`, `pullEvents`), `OrderLine` y `OrderFactory.fromCart`. Validan antes de modificar, así que un rechazo deja el pedido intacto; el subtotal conserva toda la precisión y `place()` lo redondea una vez en el evento. 34 tests nuevos; hoy 106 unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 5: `Email` (normalizado, error `INVALID_EMAIL`) y `Customer` (`isPremium` de solo lectura). 21 tests nuevos; hoy 127 unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 6: `PricingContext`, las cuatro specifications (`MinimumSubtotal`, `PremiumCustomer`, `PremiumOffer`, `FreeShipping`) y `PricingService`. Los cuatro ejemplos de `producto.md` dan S/ 110, 160, 90 y 180. 25 tests nuevos; hoy 152 unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 7 (2.7): los siete puertos como `abstract class`, sin importar Nest ni Prisma. No llevan tests propios porque no tienen comportamiento: `tsc` comprueba los tipos y los fakes de la tarea 2.8 los ejercitan |
| 2026-10-27 | Corte 2, tarea 8 (2.8): fakes en memoria de los siete puertos, más `fixedCatalog()`, `customersWithPremium()` y `ISBN`. Sus 27 tests encontraron un defecto en `FixedCatalog` (lanzaba de forma síncrona en vez de rechazar la promesa). Hoy 179 unitarios y 7 e2e pasan |
| 2026-10-27 | Corte 2, tarea 9 (2.9): test de la regla de dependencias; 37 tests, de los cuales 5 inyectan imports prohibidos en el código real para comprobar que se detectan. **Corte 2 terminado:** `contracts/` no importa nada de `contexts/`, las invariantes del dominio tienen tests unitarios sin base de datos, `lint`, `test` y `test:e2e` pasan. Hoy 216 unitarios y 7 e2e. Queda abierta la decisión sobre pedidos en USD |
| 2026-10-27 | Corte 2, tarea 10 (2.10): reglas de precio por moneda. Los pedidos en dólares se cobran con mínimo de envío gratis de 40.00 USD y envío de 3.00 USD; los cuatro ejemplos de `producto.md` tienen su versión en USD. 16 tests nuevos; hoy 232 unitarios y 7 e2e pasan |
| 2026-10-27 | Plan del corte 3 (3.0): 8 tareas (3.1–3.8) con su cuadro, sus comprobaciones, 4 decisiones por confirmar y los riesgos. Rama `feature/corte-3-catalogo-inventario`, abierta desde la del corte 2. Docker 29.8 y `postgres:18` están disponibles en local; falta probar Testcontainers en la tarea 3.1 |
| 2026-10-27 | Revisión del plan del corte 3 (3.0): se pasa de 8 a 9 tareas. Faltaban el aislamiento entre archivos de test (Vitest los ejecuta en paralelo y comparten una base), mover el CI y el README a la tarea 2 para que el repositorio no quede incoherente tras cambiar a Testcontainers, la validación de entradas de `ReserveStockHandler`, un libro del seed sin registro de stock y las ayudas para datos de prueba |
| 2026-10-27 | Corte 3, tarea 1 (3.1): entorno de integración con Testcontainers. Los 7 e2e pasan sobre un contenedor propio, incluso con `DB_*` apuntando a un host inexistente; sin Docker, `test:e2e` falla con un mensaje que explica qué hacer y `pnpm test` sigue funcionando. 13 tests nuevos (5 del `globalSetup` con mocks, 3 del guardián, 5 de integración del entorno, 2 de aislamiento entre archivos). Hoy 240 unitarios y 16 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 2 (3.2): el workflow de CI ya no levanta el servicio `postgres` ni ejecuta `db:deploy` (los e2e traen su contenedor), y el README, `06-tests.md` y `02-estructura` describen la nueva forma de probar. Sus pasos se ejecutaron en local sobre una copia limpia, sin `.env`, y pasan; la primera ejecución real en GitHub sigue pendiente |
| 2026-10-27 | Corte 3, tarea 3 (3.3): seed con 2 clientes (normal y premium), 6 libros (PEN, USD, inactivo, agotado y sin registro de stock) y 5 registros de stock. 16 tests nuevos (10 de los datos, 6 que ejecutan `pnpm run db:seed` sobre el contenedor). Una mutación sobrevivió al principio —el seed podía dejar de restaurar a los clientes sin que nada fallara— y se cubrió con un test. Hoy 250 unitarios y 22 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 4 (3.4): `GetBookPriceHandler` y `CatalogModule`. Devuelve `{ isbn, title, author, price: { amount, currency } }` con el monto en texto de 2 decimales; inexistente o inactivo da `NotFoundError`. 9 tests nuevos (7 de integración por el `QueryBus` y 2 del generador de ISBN de pruebas). Hoy 252 unitarios y 29 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 5 (3.5): `GET /books/:isbn` con `BookController`, `CatalogModule` en `AppModule` y Swagger (`/docs-json` lista `/books/{isbn}` con sus 200, 404 y 422). 12 tests e2e nuevos. Comprobado además con `curl` contra la API real y una base temporal con el seed (200 en PEN y USD, ISBN con guiones, 404 inactivo, 200 sin registro de stock, 422 y `X-Request-Id`). Hoy 252 unitarios y 41 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 6 (3.6): `ReserveStockHandler` e `InventoryModule`. Reserva todas las líneas o ninguna; sin stock da `OutOfStockError` sin cambiar nada, un libro sin registro da `StockItemNotFoundError`. 23 tests nuevos (21 de integración por el `CommandBus`, con pedidos simultáneos, y 2 unitarios de la carrera `P2002`). Hoy 254 unitarios y 62 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 7 (3.7): `ReleaseStockHandler`. Liberar dos veces, también en simultáneo, devuelve el stock una sola vez; un pedido sin reserva no hace nada; no toca reservas `CONFIRMED`. 13 tests nuevos de integración y validación del `orderId` también al reservar. Al añadir esa validación fallaron 2 tests unitarios de la 3.6 (usaban `'o-1'` como `orderId`) y se corrigieron. Hoy 254 unitarios y 75 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 8 (3.8): tests de `stock.handlers`. Dos pedidos con los mismos libros en orden inverso reservan a la vez, varias rondas de pedidos cruzados, liberaciones cruzadas, reservar y liberar a la vez, y conservación del stock total. 7 tests nuevos. Se comprobó que fallan, con interbloqueos reales, si se quita el orden de bloqueo en `reserve`, en `release` o en el helper, o si cada uno ordena distinto; y que son estables (6 ejecuciones seguidas sin fallos). Hoy 254 unitarios y 82 de integración y e2e pasan |
| 2026-10-27 | Corte 3, tarea 9 (3.9): cableado y cierre. 7 tests e2e por los buses con la aplicación completa, 4 de la regla de `application/` y 2 del filtro HTTP con los errores de stock. **Corte 3 terminado:** `GET /books/:isbn` responde (e2e y `curl` real); reservar sin stock lanza `OutOfStockError` y no cambia nada; los tests contra PostgreSQL real pasan (Testcontainers); la simulación completa del CI en una copia limpia pasa (lint, formato, build, 261 unitarios, 89 de integración y e2e, auditoría). Hoy 261 unitarios y 89 de integración y e2e |
| 2026-10-27 | Corte 3, tarea 10 (3.10): bloqueo por pedido en la reserva. Antes, dos reservas simultáneas del mismo pedido con libros distintos tenían éxito las dos (2 reservas para un pedido); ahora una se crea y la otra da `ORDER_ALREADY_RESERVED`. 2 tests nuevos (uno mide el tiempo para comprobar que pedidos distintos no se esperan); estables en 5 ejecuciones. Se comprobó que fallan sin el bloqueo, con un bloqueo global y con el bloqueo después de la comprobación. Hoy 261 unitarios y 91 de integración y e2e pasan |
| 2026-10-27 | Plan del corte 4 (4.0): 8 tareas (4.1–4.8) con su cuadro, sus comprobaciones, 5 decisiones y los riesgos. Rama `feature/corte-4-outbox`, abierta desde la del corte 3. Se revisó el diseño de la guía contra el esquema real y las APIs de Nest instaladas, y se anotaron cuatro puntos que la guía no cubre: el orden por id del evento, el reloj de los reintentos, el apagado ordenado y el intervalo real en los e2e |
| 2026-10-27 | Corte 4, tarea 1 (4.1): `outbox-consumer.ts`, `@OutboxHandler()`, `OutboxRegistry` y `OutboxModule`. Descubre los consumidores decorados, devuelve los de un evento, y rechaza al arrancar los nombres duplicados y los consumidores mal formados. 14 tests nuevos de integración. Hoy 261 unitarios y 105 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 2 (4.2): `OutboxWriter.append(tx, events)`. Guarda el evento y una entrega por consumidor en la transacción de quien llama (si esa se revierte, no queda nada; nadie más lo ve hasta que se confirme), con el `correlationId` fuera del payload, y descarta los eventos sin consumidores. 13 tests de integración y las ayudas compartidas `outbox-probes.ts`. En las mutaciones, `JSON.parse(JSON.stringify(event))` resultó equivalente a pasar el evento tal cual (Prisma serializa igual); se conserva por el tipo y la claridad. Hoy 261 unitarios y 118 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 3 (4.3): `OutboxRelay.runOnce()`. Entrega a consumidores `db` y `external`, marca `DONE`, restaura el `correlationId` (o usa `event-<id>`), respeta el orden por pedido y el lote de 10, y no reclama lo que tiene el bloqueo vigente ni los reintentos futuros. 21 tests de integración, estables en 5 ejecuciones. Una mutación (quitar el `ORDER BY` del lote) sobrevivió tres veces porque PostgreSQL devolvía las filas en el mismo orden por el orden físico y por el índice; se cubrió desordenando ambos a propósito. Hoy 261 unitarios y 139 de integración y e2e pasan |
