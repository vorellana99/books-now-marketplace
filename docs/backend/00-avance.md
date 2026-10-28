# Backend: control de avance

> Seguimiento de la implementación de `apps/main-api` según las fases de la guía. Se actualiza en cada commit que avance una tarea: marca la casilla, anota lo que cambió respecto a la guía y deja una línea en la [bitácora](#bitácora).

**Leyenda:** ⬜ pendiente · 🔄 en curso · ✅ hecho · ⛔ bloqueado

Los cortes 0 a 5 traen un cuadro de **Tareas** que explica qué es cada una y para qué sirve; debajo queda la lista de casillas con el detalle. Al terminar una tarea de un corte en curso, se marca en las dos. Los commits de cada tarea llevan su número (`2.7`, `3.1`…).

## Resumen

| # | Corte | Fases de la guía | Estado | Rama | PR |
|---|---|---|---|---|---|
| 0 | Scaffold del proyecto | 0 | ✅ | `feature/initial` | — |
| 1 | Fundaciones | 1 | ✅ | `claude/gifted-brown-gqfpwp` | — |
| 2 | Dominio de Ventas | 2–3 | ✅ | `feature/corte-2-dominio-ventas` | — |
| 3 | Catálogo e Inventario | 4–5 | ✅ | `feature/corte-3-catalogo-inventario` | — |
| 4 | Outbox | 6 | ✅ | `feature/corte-4-outbox` | — |
| 5 | Compra completa | 7–9 | 🔄 | `feature/corte-5-compra-completa` | — |
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

**Listo cuando:** `docker compose up` y `pnpm run start:dev` levantan; `/health/ready` y `/docs` responden con el header `X-Request-Id`, y los logs incluyen el `requestId` (campo de primer nivel en JSON en producción, prefijo en texto en desarrollo).

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

## Corte 4: Outbox ✅

**Guía:** [05-piezas-clave](05-piezas-clave.md) (Platform: el Outbox) · [06-tests](06-tests.md)

**Listo cuando:** los tests de integración del Outbox pasan, incluido el del `correlationId`.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Consumidores y registro | `outbox-consumer.ts` (consumidor `db` y `external`), `@OutboxHandler()` y `OutboxRegistry` | Que el sistema sepa qué consumidores existen y a qué evento responde cada uno | ✅ |
| 2 | `OutboxWriter` | `append(tx, events)`: guarda el evento y una entrega por consumidor | Que el evento se guarde en la misma transacción que el pedido | ✅ |
| 3 | Relay: reclamar y entregar | `runOnce()`: reclama con `SKIP LOCKED`, entrega y marca `DONE`, con consumidores `db` y `external` | Que cada evento llegue a su consumidor y quede marcado | ✅ |
| 4 | Relay: fallos y reintentos | Retroceso exponencial, `last_error` y paso a `FAILED` | Que un consumidor que falla no se pierda ni bloquee a los demás | ✅ |
| 5 | Relay: concurrencia | `SKIP LOCKED`, bloqueo vencido y *fencing* por `attempts` | Que dos instancias no entreguen lo mismo y una lenta no pise a otra | ✅ |
| 6 | Ciclo de vida del relay | `tick()` con una vuelta a la vez, `isAlive()` y apagado ordenado | Que el relay corra solo, se sepa si está vivo y se detenga sin dejar entregas a medias | ✅ |
| 7 | Salud del Outbox | `OutboxHealthIndicator` y `GET /health/outbox` | Que monitoreo sepa si el relay sigue vivo y cuántas entregas fallan | ✅ |
| 8 | Cableado y cierre | `OutboxModule` en `AppModule`, prueba con el intervalo real, README operativo, CI y guía | Cerrar el corte con el "listo cuando" cumplido de verdad | ✅ |
| 9 | Logs JSON con el `requestId` de primer nivel | Cambia `RequestAwareLogger` para formatear el JSON con `requestId` aparte y `message` siempre del mismo tipo | Que los indexadores de logs no rechacen líneas y que los seis niveles lleven el id | ✅ |

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
- [x] 4.4 Fallos y reintentos del relay. Se comprueba: reintenta con retroceso y tras agotar los intentos queda `FAILED` con su motivo; el SQL de reprocesar de la guía funciona
- [x] 4.5 Concurrencia del relay (bloqueo vencido y *fencing* por `attempts`). Se comprueba: entrega única con dos relays; un bloqueo vencido se retoma; la instancia lenta no pisa el `DONE` de la otra y revierte su efecto `db`
- [x] 4.6 `tick()`, `isAlive()` y apagado ordenado del relay. Se comprueba: sin vueltas solapadas; un error no mata el intervalo; `isAlive` con reloj controlado
- [x] 4.7 `OutboxHealthIndicator` y `GET /health/outbox`. Se comprueba: 200 con el relay vivo y 503 si está detenido; `failed` y `due` en el detalle; una `FAILED` antigua no lo pone en rojo
- [x] 4.8 `OutboxModule` registrado en `AppModule`, README operativo, CI y guía. Se comprueba: un evento escrito con `append` llega solo a su consumidor con el intervalo real, con el `correlationId` en sus logs
- [x] 4.9 `RequestAwareLogger`: `requestId` como campo de primer nivel en JSON y `message` siempre del mismo tipo, en los seis niveles. Se comprueba: tests sobre la forma real del JSON y del texto, y el log de un consumidor del Outbox leído de punta a punta

---

## Corte 5: Compra completa 🔄

**Guía:** [04-flujo-pedido-y-saga](04-flujo-pedido-y-saga.md) · [05-piezas-clave](05-piezas-clave.md) · [api-contrato](../api-contrato.md) · [06-tests](06-tests.md)

**Listo cuando:** `POST /orders` devuelve 201 con saga e idempotencia; tras la compra, el email aparece en el log, la reserva queda `CONFIRMED` y `/health/outbox` responde 200; los e2e pasan (flujo feliz, sin stock, pago rechazado).

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | `PlaceOrderHandler` | La saga con los fakes: idempotencia, reserva, cobro, guardado y compensaciones | Que cada fallo deje todo como estaba y un reintento nunca cobre dos veces | ✅ |
| 2 | Checkouts y clientes | `PrismaCheckoutLog` y `PrismaCustomerRepository`, con tests de contrato compartidos con el fake | Que el estado de la saga sobreviva a caídas | ✅ |
| 3 | Guardar el pedido | `PrismaOrderRepository` y `OrderMapper` (más `Order.restore`) | Que pedido, cobro registrado y evento se confirmen juntos o ninguno | ✅ |
| 4 | Adaptadores en proceso | `CatalogInProcessAdapter`, `InventoryInProcessAdapter` y `ConsoleNotifier` | Que Ventas hable con los otros contextos solo por contratos | ✅ |
| 5 | Pasarelas de pago | La pasarela simulada y `ExternalPaymentAdapter` con timeout de 10 s | Cobrar y reembolsar por referencia, de forma idempotente | ⬜ |
| 6 | Recuperación de checkouts | `RecoverCheckoutsJob` | Reembolsar y liberar lo que quedó a medias tras una caída | ⬜ |
| 7 | Consumidores del evento | `ConfirmReservationConsumer` (`db`) y `SendOrderConfirmationConsumer` (`external`) | Que la compra confirme la reserva y avise por email | ⬜ |
| 8 | API HTTP | `PlaceOrderDto`, `OrderController`, `GetOrderHandler` y Swagger | Publicar `POST /orders` y `GET /orders/:id` | ⬜ |
| 9 | Cableado | `SalesModule` en `AppModule`, `PAYMENT_PROVIDER` y el límite de tiempo de la base | Que la app real quede conectada | ⬜ |
| 10 | e2e y cierre | Los flujos de `06-tests.md`, README, guías y CI | Cumplir el "listo cuando" del corte | ⬜ |

**Huecos de la lista original que este plan cubre:** falta `PrismaCustomerRepository`; `Order` no se podía reconstruir desde la base (`Order.restore`); el `save` de la guía marcaba `COMPLETED` sin comprobar que el checkout siguiera `PENDING` (si el job de recuperación ya lo había anulado, se creaba un pedido sin cobro y sin stock); la guía no define cómo rechaza pagos la pasarela simulada ni el contrato HTTP de la real; el DTO rechazaba ISBN con guiones y el hash distinguía `978-0-…` de `978…`; el hash usaba `localeCompare`; no había timeouts de base de datos aunque la guía los da por supuestos; `OutboxModule` no es global aquí, así que `SalesModule` lo importa; y se añaden tests de contrato para que el fake de `CheckoutLog` no se desvíe de Prisma, y un test de que `cardToken` no queda en la base ni en los logs.

**Decisiones** (D1 a D5 se acordaron con el usuario; todas con la opción recomendada):

1. **D1 · Cómo rechaza pagos la pasarela simulada:** por convención en el token. `tok_declined` rechaza, `tok_error` lanza un error y cualquier otro aprueba.
2. **D2 · Pasarela real:** adaptador contra un contrato HTTP mínimo y documentado, provisional hasta elegir proveedor (`POST /charges` y `POST /refunds`, con la referencia, el monto en texto, la moneda y el token), con timeout de 10 s.
3. **D3 · ISBN en `POST /orders`:** se normaliza con `Isbn.create` (acepta guiones) y un ISBN inválido da `422 INVALID_ISBN`; el hash usa el ISBN normalizado.
4. **D4 · `OrderRepository.findById`:** se implementa con `Order.restore`, que permite probar la ida y vuelta del mapeo.
5. **D5 · Límite de tiempo de la base:** `statement_timeout` de 5 s (configurable con `DB_STATEMENT_TIMEOUT_MS`), junto con la comprobación de `PENDING` en `save`.

**Riesgos:** es el corte más grande y delicado, así que cada compensación se prueba con un test y rompiendo el código a propósito; los dos `POST` simultáneos con la misma clave se prueban con una pasarela que se queda parada (sin tiempos); el timeout del adaptador es configurable para probarlo en milisegundos; el job de cada 5 minutos se prueba llamando a `run()`; el proveedor real aún no está elegido.

- [x] 5.1 `PlaceOrderCommand` y `PlaceOrderHandler` con compensaciones e idempotencia. Se comprueba: los casos de `06-tests.md` (sin stock, pago rechazado, falla al guardar, timeout del cobro, commit ambiguo, reembolso fallido, reintentos y hash)
- [x] 5.2 `PrismaCheckoutLog` y `PrismaCustomerRepository`, con tests de contrato compartidos. Se comprueba: clave repetida, `abort` que no toca un `COMPLETED`, recuperación con `SKIP LOCKED` y bloqueo
- [x] 5.3 `PrismaOrderRepository` y `OrderMapper` (pedido + checkout + outbox en una transacción). Se comprueba: atomicidad, ida y vuelta, y un checkout ya anulado
- [x] 5.4 Adaptadores: `CatalogInProcessAdapter`, `InventoryInProcessAdapter`, `ConsoleNotifier`. Se comprueba: los errores conservan su clase y el log del email lleva el `requestId`
- [ ] 5.5 Pasarela simulada y `ExternalPaymentAdapter` (timeout de 10 s). Se comprueba: contra un servidor HTTP de prueba (aprobado, rechazado, timeout, error 5xx)
- [ ] 5.6 `RecoverCheckoutsJob`. Se comprueba: caída tras cobrar, `COMPLETED` intacto, reembolso fallido que se reintenta, dos jobs a la vez
- [ ] 5.7 Consumidores: `SendOrderConfirmationConsumer` y `ConfirmReservationConsumer`. Se comprueba: reserva `HELD` a `CONFIRMED` junto con `DONE`; email con `eventId` como clave
- [ ] 5.8 `OrderController`, `PlaceOrderDto` y `GetOrderHandler` (`GET /orders/:id`). Se comprueba: 201, 400, 404, 409, 422 y la forma de la respuesta
- [ ] 5.9 `SalesModule` y conexión en `AppModule`. Se comprueba: arranca con las dos pasarelas y los consumidores quedan registrados
- [ ] 5.10 e2e de `orders` (incluye dos `POST` simultáneos con la misma clave y el `X-Request-Id`), README, guías y CI. Se comprueba: tras comprar, el email aparece en el log, la reserva queda `CONFIRMED` y `/health/outbox` responde 200

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
| 2026-10-27 | 4 | Las columnas `TIMESTAMP(3)` de Prisma **no llevan zona horaria** y guardan la hora en UTC. Los valores que escribe la base con `now()` usan la zona de la sesión, y los que escribe Prisma con una `Date` de JavaScript, UTC; los dos coinciden solo si la base trabaja en UTC. La causa raíz y su corrección se explican en la fila de la 4.4. En los tests, el cliente `pg` lee esas columnas como UTC (`setTypeParser(1114)`), porque por defecto las desplaza según la zona de Node | Descubierto al escribir los tests del writer: una fecha guardada a las 00:17 UTC se leía como 05:17 en esta máquina (UTC−5). En producción, la base debería ejecutarse en UTC |
| 2026-10-27 | 4 | `OutboxRelay.runOnce()` reclama con la consulta de la guía (`SKIP LOCKED`, `NOT EXISTS` para el orden por pedido y consumidor, lote de 10, bloqueo de 2 minutos) y entrega a consumidores `db` (efecto y `DONE` en una transacción) y `external` (sin transacción abierta). `BATCH` y `LEASE_MS` se exportan. En esta tarea un error del consumidor aún sube sin tratarse: los fallos llegan en la 4.4 y el módulo no está conectado a la app hasta la 4.8 | Cada tarea se verifica sola. Que `DONE` y el efecto `db` van en la misma transacción solo se puede demostrar con un fallo en medio (la instancia lenta de la 4.5); mientras tanto, desde otra conexión se comprueba que ni el efecto ni `DONE` se ven hasta que el consumidor termina |
| 2026-10-27 | 4 | **Defecto corregido: las conexiones de la aplicación ahora fuerzan la zona horaria UTC** (`options: '-c timezone=UTC'` en `PrismaService`). Prisma rellena `@default(now())` en el cliente, en UTC, mientras el relay compara con `now()` de la base, que usa la zona de su sesión. En una base al oeste de UTC (UTC−5), **una entrega nueva quedaba programada 5 horas en el futuro y no se entregaba nada**; no se notaba con la base en UTC | Lo destapó una prueba con la base de pruebas puesta en `America/Lima`: antes de que fallara nada, la entrega ya tenía `next_attempt_at` 5 horas adelantado. Mi primera hipótesis (que Prisma ya usaba UTC por su cuenta) era falsa: se midió y las dos conexiones usaban la zona de la base |
| 2026-10-27 | 4 | Los reintentos usan el reloj de la base de datos (`now() + make_interval(...)` en SQL), no `Date.now()` como la guía (decisión 1). Con la zona forzada a UTC, la hora de JavaScript y la de la base dan el mismo resultado en una misma máquina; la diferencia aparece si el reloj de la aplicación está desfasado respecto al de la base, y un test lo comprueba adelantando `Date` una hora | La primera versión de este argumento era errónea (decía que la zona de la base lo hacía obligatorio). La prueba del desfase sí distingue las dos formas |
| 2026-10-27 | 4 | Los reintentos y los bloqueos que se escriben a mano en SQL (por ejemplo, el reproceso de entregas `FAILED` de la guía) deben ejecutarse con `SET TIME ZONE 'UTC'`: una sesión de `psql` en otra zona escribiría `now()` en su hora local y, al este de UTC, programaría la entrega horas en el futuro | Las columnas no llevan zona horaria. La guía lo indica ahora en el SQL de reprocesar |
| 2026-10-27 | 4 | Un fallo **tardío** de una instancia que ya perdió la entrega se ignora: no cambia el estado que dejó la otra y se registra como aviso, no como `FAILED` en el log de errores. La guía registraba un `FAILED` aunque la actualización no tocara ninguna fila | Si la lenta falla después de que la otra terminó, el SQL con comprobación del intento ya no modifica nada, pero el log anunciaría un `FAILED` que no ocurrió y dispararía una alerta falsa |
| 2026-10-27 | 4 | Apagado ordenado del relay (decisión 2): `stop()` deja de empezar vueltas y espera la que esté en curso hasta 15 s (`STOP_TIMEOUT_MS`); se invoca en `beforeApplicationShutdown`. Para que esa espera sea posible, `PrismaService` pasa de `onModuleDestroy` a `onApplicationShutdown`: Nest cierra en el orden destruir módulos → antes del apagado → cerrar el servidor → apagado, y la conexión debe seguir abierta mientras el relay termina | Si Prisma se desconectara primero, no fallaría la entrega (Prisma se reconecta solo con la siguiente consulta), pero esa reconexión **dejaría una conexión abierta tras el cierre**, y el proceso no terminaría limpio; un test cuenta las conexiones que quedan. Mi primera explicación ("la entrega fallaría") era incorrecta |
| 2026-10-27 | 4 | `OutboxHealthIndicator` se provee en `HealthModule` (necesita `HealthIndicatorService`, de Terminus), que ahora importa `OutboxModule`. Si la base no responde al contar, el indicador sale `down` con el error en vez de romper la respuesta; la guía lo dejaba propagar | Una caída de la base no debe convertir `/health/outbox` en un error sin forma. Un efecto lateral buscado: al depender de `OutboxModule`, el relay ya forma parte de la aplicación completa (con `ScheduleModule` de `AppModule` corre cada segundo), así que la tarea 4.8 solo lo hace explícito |
| 2026-10-27 | 4 | Tras arrancar, `/health/outbox` responde 503 hasta que el relay termina su primera vuelta (alrededor de 1 segundo), porque `isAlive()` exige una vuelta terminada. Es esperable para un endpoint de monitoreo; `/health/live` y `/health/ready` no dependen del Outbox y no se ven afectados | Un test comprueba que con el relay detenido solo `/health/outbox` está en 503 |
| 2026-10-27 | 4 | `AppModule` registra `OutboxModule` por sí mismo (antes llegaba solo porque `HealthModule` lo importa) y mantiene `ScheduleModule`, que es lo que pone en marcha el intervalo. Los tests lo comprueban, y también que `OutboxModule` por sí solo no programa nada | Depender de un efecto lateral de otro módulo es frágil: quitar el endpoint de salud habría apagado el relay sin avisar |
| 2026-10-27 | 4 | Límite conocido (decisión 3): el orden de entrega por pedido usa el id del evento (uuidv7), no el orden de confirmación. Hoy no afecta, porque cada pedido genera un solo evento. Queda escrito en la guía y en el README | Se revisa si algún día hay varios eventos por pedido |
| 2026-10-27 | 1 | `RequestAwareLogger` formatea en vez de envolver: sobrescribe `getJsonLogObject` (JSON) y `stringifyMessage` (texto) en lugar de `log`/`warn`/`error`. Depende de dos métodos protegidos de `ConsoleLogger` de Nest; los tests sobre la forma real de la salida fallarían si una versión futura los cambia | Cubre los seis niveles y evita el conflicto de tipos en `message`. Elegida entre cuatro opciones (dejarlo, primer nivel, ambos formatos, o `nestjs-pino`) |
| 2026-10-28 | 5 | `PlaceOrderHandler` normaliza los ISBN con `Isbn.create` (acepta guiones, `INVALID_ISBN` si están mal) antes de calcular el hash, y `hashRequest` ordena con comparación de texto simple en vez de `localeCompare`. Si la clave ya existe al iniciar el checkout y `findByKey` no la encuentra, responde `CHECKOUT_IN_PROGRESS` en vez de fallar con un valor nulo | D3 acordada. Sin la normalización, `978-0-…` y `978…` (la misma compra) darían hashes distintos y un reintento se rechazaría como otro carrito |
| 2026-10-28 | 5 | Los fakes de test se acercan a lo real: un pago **rechazado** ya no cuenta como cobrado (`FakePaymentGateway.charged`; los intentos están en `attempts`), así reembolsar tras un rechazo no hace nada, y `FakeStockReservation` puede fallar al liberar (`releaseFails`) | Con el fake anterior, el reembolso tras un rechazo parecía haber hecho algo y no se podía probar que la compensación se queda a medias si falla la liberación |
| 2026-10-28 | 5 | `claimStale` añade `ORDER BY started_at` a la consulta de la guía: recupera primero lo más antiguo. El tamaño del lote (`RECOVERY_BATCH = 5`) vive en el puerto y lo comparten Prisma y el fake. Un checkout con monto pero sin moneda falla con un mensaje claro en vez de responder un cobro inventado | Sin el `ORDER BY`, con más de un lote el orden dependería del plan de la consulta. Con el índice `(status, started_at)` PostgreSQL ya lo devuelve así por casualidad, por eso un test quita el índice un momento para que sea una garantía |
| 2026-10-28 | 5 | Tests de contrato: `checkoutLogContract` (`test/support/checkout-log.contract.ts`) se ejecuta contra el fake en memoria y contra `PrismaCheckoutLog`. Al escribirlo destapó dos diferencias del fake (no limitaba el lote a 5 ni tenía forma de vencer el bloqueo) y otras dos al añadir el orden; el bloqueo del fake pasó de 5 a 2 minutos, como el real | La saga se probó con el fake: si el fake se desvía de la implementación real, esas pruebas dejan de valer. El contrato lo impide |
| 2026-10-28 | 5 | `PrismaOrderRepository.save` completa el checkout con `updateMany` **solo si sigue `PENDING`** y lanza `ConflictError('CHECKOUT_NOT_PENDING')` (que deshace la transacción) si no actualizó ninguna fila. Va antes de crear el pedido | La guía hacía `checkout.update` sin condición: si `RecoverCheckoutsJob` ya había reembolsado, liberado y anulado el checkout mientras este proceso seguía vivo, se creaba un pedido sin cobro y sin stock, y el checkout pasaba de `ABORTED` a `COMPLETED` |
| 2026-10-28 | 5 | `save` también se niega con `ORDER_NOT_PLACED` si el pedido no está confirmado y con `CURRENCY_MISMATCH` si el monto cobrado no tiene la moneda del pedido; el redondeo (`toFinal`) se hace una sola vez dentro de `save` | La guía no validaba ninguna de las dos cosas; un pedido en borrador o un cobro en otra moneda quedarían guardados sin error |
| 2026-10-28 | 5 | `Order.restore` (nuevo) reconstruye un pedido ya confirmado desde la base, sin eventos, y `findById` ordena las líneas por ISBN. `OrderMapper` (`toDomain` y `toCreate`) pasa siempre por texto: `unit_price` se guarda con la escala de la columna (6) y el monto cobrado con 2 decimales | Decisión D4. El constructor del agregado solo crea borradores y `addBook` aplica el máximo de 10 unidades, que no debe exigirse a un pedido ya guardado |
| 2026-10-28 | 5 | `ConsoleNotifier` escribe el correo con el `Logger` de Nest (`Email a <destinatario>: <mensaje> (clave de idempotencia <clave>)`), sin tocar el `requestId`: lo añade `RequestAwareLogger` al formatear. Un correo sin clave no menciona ninguna | La guía solo lo nombra. Es un sustituto de desarrollo: el destinatario queda en el log, así que no debe usarse en producción con datos reales; se reemplaza por el adaptador del proveedor de email cuando se elija |
| 2026-10-28 | 5 | `CatalogInProcessAdapter` consulta los libros del carrito en paralelo (`Promise.all`) y conserva el orden; si uno falla, falla todo el carrito con su `NotFoundError`. Los adaptadores esperan (`await`) al bus y no envuelven los errores | Para que `OutOfStockError`, `StockItemNotFoundError` y `NotFoundError` lleguen con su clase al filtro HTTP (422 y 404) |

## Problemas abiertos

| Fecha | Corte | Problema | Estado |
|---|---|---|---|
| 2026-10-27 | 3 | Docker en el entorno en la nube: el daemon no está activo por defecto. Se levanta con `dockerd` en segundo plano y `postgres:18` se descarga bien. Falta comprobar Testcontainers | Docker ✅ · Testcontainers ✅ verificado en local (3.1); en el entorno en la nube sigue sin probarse |
| 2026-10-27 | 1 | El entorno en la nube tenía Node 22.22 (en local es 24.21); la guía pide Node 24 LTS (≥ 24.15). `engines` exige `>=24.15` y el workflow de CI usa Node 24 | ✅ Resuelto |
| 2026-10-27 | 1 | Los tests e2e necesitan la BD levantada (`pnpm run db:up`) y las variables `DB_*` definidas. El workflow `.github/workflows/main-api.yml` ya lo hace: levanta `postgres:18`, aplica las migraciones y corre los e2e. Falta ver su primera ejecución en GitHub | Parcial: workflow escrito, sin ejecutar en GitHub. Desde la 3.2 los e2e levantan su propio PostgreSQL (no usan el servicio `postgres`) |
| 2026-10-27 | 2 | Los pedidos en **USD** no se podían valorizar: las reglas de envío estaban fijas en soles. Se resolvió en la tarea 2.10 con una tabla de reglas por moneda | ✅ Resuelto |
| 2026-10-27 | 1 | En modo JSON (producción), el `requestId` de un log iba **dentro de `message`**, y `message` cambiaba de tipo (texto sin petición, objeto con petición); además `debug`, `verbose` y `fatal` salían sin el id. Se corrigió en la tarea 4.9: el `requestId` es un campo de primer nivel y `message` conserva su tipo | ✅ Resuelto |

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
| 2026-10-27 | Corte 4, tarea 4 (4.4): fallos y reintentos del relay. Un consumidor que falla deja la entrega `PENDING` con el motivo (máx. 1000 caracteres) y el bloqueo liberado; el retroceso es de 2, 4, 8… segundos con tope de 5 minutos; al agotar `OUTBOX_MAX_ATTEMPTS` queda `FAILED` y se registra como error; un fallo no detiene al resto del lote, un `FAILED` no frena los eventos siguientes del mismo pedido, y un consumidor no registrado también termina en `FAILED`. El efecto de un consumidor `db` se revierte si falla. 30 tests nuevos de integración. Se destapó y corrigió el defecto de la zona horaria (ver desvíos). Hoy 261 unitarios y 169 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 5 (4.5): concurrencia del relay. Dos instancias se reparten el trabajo sin repetir entregas, conservan el orden por pedido, y una entrega reclamada por una instancia caída se retoma al vencer su bloqueo. La instancia lenta no pisa a la otra: en `db` su transacción se revierte (efecto incluido), en `external` solo avisa de que pudo repetirse, y sus fallos tardíos no cambian el estado ni anuncian un `FAILED`. 10 tests de integración, estables en 6 ejecuciones; las 10 mutaciones se detectan (una sobrevivió hasta añadir un test con máximo de 1 intento). Hoy 261 unitarios y 179 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 6 (4.6): ciclo de vida del relay. `tick()` (cada segundo con `@Interval`) hace una vuelta a la vez y un error no mata el intervalo; `isAlive()` es verdadero con una vuelta terminada hace menos de 1 minuto o en curso hace menos de 2 (el bloqueo); `lastRunAtIso`; apagado ordenado con tope. 22 tests unitarios con reloj controlado y 2 de integración que cierran la app a mitad de una entrega; 13 mutaciones detectadas (una sobrevivió hasta medir las conexiones abiertas). Hoy 283 unitarios y 181 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 7 (4.7): `GET /health/outbox`. 200 con el relay vivo y 503 si está detenido (sin vueltas hace más de un minuto); `relayLastRunAt`, `failed` y `due` en el detalle; una entrega `FAILED` antigua o un reintento en espera no lo ponen en rojo. 6 tests unitarios del indicador y 7 de integración con el reloj adelantado; 11 mutaciones detectadas (4 tuvieron que rehacerse por el formato). Hoy 289 unitarios y 188 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 8 (4.8): cableado y cierre. `AppModule` registra `OutboxModule`; 10 tests e2e con la aplicación completa y el intervalo real (un evento guardado con `append` llega solo a su consumidor, un fallo se reintenta solo con el retroceso real de 2 s, el log del consumidor lleva el `requestId` de origen o `event-<id>`, `/health/outbox` pasa a 200 y sin `ScheduleModule` el relay no corre solo), estables en 3 ejecuciones; 5 mutaciones detectadas. README con una sección operativa del Outbox, y las guías de pruebas y de piezas clave al día. **Corte 4 terminado:** los tests de integración del Outbox pasan, incluido el del `correlationId`. Hoy 290 unitarios y 198 de integración y e2e pasan |
| 2026-10-27 | Corte 4, tarea 9 (4.9): logs JSON con el `requestId` de primer nivel y `message` siempre del mismo tipo, en los seis niveles (antes `debug`, `verbose` y `fatal` salían sin id). Es una corrección al logger del corte 1, descubierta al probar los logs del relay. 22 tests nuevos de la forma real del JSON y del texto (incluidas peticiones simultáneas) y los 2 del e2e del Outbox actualizados; 6 mutaciones detectadas. Hoy 312 unitarios y 198 de integración y e2e pasan |
| 2026-10-28 | Plan del corte 5 (5.0): 10 tareas (5.1–5.10) con su cuadro, los huecos de la lista original, 5 decisiones acordadas con el usuario (todas con la opción recomendada) y los riesgos. Rama `feature/corte-5-compra-completa`, abierta desde `develop` al día (a partir de ahora las ramas parten de `develop`) |
| 2026-10-28 | Corte 5, tarea 1 (5.1): `PlaceOrderHandler` (la saga) y `hashRequest`. Cubre los casos de `06-tests.md`: sin stock, pago rechazado, falla al guardar, timeout del cobro (reembolsa de todos modos), commit ambiguo (no compensa), reembolso o liberación fallidos (el checkout queda `PENDING` y el cliente recibe el error original), y los cuatro finales de un reintento con la misma clave. Compensa en orden (reembolsar, liberar, `ABORTED`). 42 tests nuevos y 2 de los fakes; 28 mutaciones detectadas. Una sobrevivió hasta mirar el importe exacto, porque `toFixed()` redondea por su cuenta y escondía que faltara `toFinal()`. Hoy 356 unitarios y 198 de integración y e2e pasan |
| 2026-10-28 | Corte 5, tarea 2 (5.2): `PrismaCheckoutLog` (`start` con la clave única, `findByKey`, `isCompleted`, `abort` que solo cambia `PENDING`, `claimStale` con `SKIP LOCKED`, bloqueo de 2 minutos y lote de 5) y `PrismaCustomerRepository`. El mismo contrato se ejecuta contra el fake y contra Prisma, más pruebas solo de PostgreSQL real: dos `start` simultáneos, dos recuperaciones a la vez, una fila bloqueada por otra transacción, una base en otra zona horaria y datos inconsistentes. 18 tests de contrato del fake y 28 de integración; 20 mutaciones detectadas. Dos sobrevivieron con razón (`SKIP LOCKED` y el `ORDER BY`) hasta escribir tests que miran la espera y quitan el índice; además, una corrida con la línea base en rojo invalidó resultados y se repitió. Hoy 374 unitarios y 226 de integración y e2e pasan |
| 2026-10-28 | Corte 5, tarea 3 (5.3): `PrismaOrderRepository` (pedido, líneas, checkout `COMPLETED` y evento en una sola transacción), `OrderMapper` y `Order.restore`. El checkout solo se completa si sigue `PENDING`; si no, `CHECKOUT_NOT_PENDING` y no queda nada. 17 tests unitarios del mapper y de `restore` y 24 de integración contra PostgreSQL real (atomicidad incluso si el outbox escribe y luego falla, checkout `ABORTED`, `COMPLETED` o inexistente, dos guardados simultáneos, ida y vuelta en soles y dólares, FK de cliente, redondeo). 14 mutaciones: 12 detectadas a la primera y 2 sobrevivieron con razón (el `append` del outbox fuera de la transacción y quitar `toFinal`, que `toFixed` cubría mientras el redondeo global no cambie), y se escribieron tests para ambas. Hoy 391 unitarios y 250 de integración y e2e pasan |
| 2026-10-28 | Corte 5, tarea 4 (5.4): `CatalogInProcessAdapter` (por `QueryBus` y `GetBookPriceQuery`), `InventoryInProcessAdapter` (por `CommandBus`, reservar y liberar) y `ConsoleNotifier`. 6 tests unitarios del notificador (destinatario, mensaje, clave, `requestId` en JSON y en texto) y 16 de integración con los handlers reales y PostgreSQL real (precio como texto y moneda USD, orden, libro inexistente o inactivo, sin stock, sin registro de stock, `orderId` inválido, liberar dos veces). 17 mutaciones: 16 detectadas a la primera y 1 sobrevivió (`release` sin `await` que se tragaba el error) hasta añadir un test que comprueba que el error del handler se propaga. Hoy 397 unitarios y 266 de integración y e2e pasan |
