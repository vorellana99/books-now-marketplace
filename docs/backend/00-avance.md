# Backend: control de avance

> Seguimiento de la implementación de `apps/main-api` según las fases de la guía. Se actualiza en cada commit que avance una tarea: marca la casilla, anota lo que cambió respecto a la guía y deja una línea en la [bitácora](#bitácora).

**Leyenda:** ⬜ pendiente · 🔄 en curso · ✅ hecho · ⛔ bloqueado

## Resumen

| # | Corte | Fases de la guía | Estado | Rama | PR |
|---|---|---|---|---|---|
| 0 | Scaffold del proyecto | 0 | ✅ | `feature/initial` | — |
| 1 | Fundaciones | 1 | ⬜ | — | — |
| 2 | Dominio de Ventas | 2–3 | ⬜ | — | — |
| 3 | Catálogo e Inventario | 4–5 | ⬜ | — | — |
| 4 | Outbox | 6 | ⬜ | — | — |
| 5 | Compra completa | 7–9 | ⬜ | — | — |
| 6 | Funcionalidades siguientes | 10–14 | ⬜ | — | — |
| 7 | Autenticación | 15 | ⬜ | — | — |

Los cortes 1 y 2 son independientes y pueden ir en paralelo. Del 3 en adelante, cada uno depende del anterior. Una rama y un pull request por corte, partiendo de `develop`.

**Un corte está terminado cuando:** sus tareas están marcadas, `pnpm lint` y `pnpm test` pasan, sus criterios de "listo cuando…" se cumplen ejecutándolos de verdad, y la guía refleja lo que realmente se hizo.

---

## Corte 0: Scaffold ✅

- [x] Proyecto Nest 12 en ESM (`apps/main-api`)
- [x] TypeScript 6, Vitest 4, Vite 8
- [x] oxlint (`--type-aware`) y Prettier
- [x] `supertest` y `@types/supertest`
- [x] Gestor de paquetes: pnpm

**Pendiente heredado:** el "Hello World" (`AppController`, `AppService`, `src/app.controller.spec.ts`, `test/app.e2e-spec.ts`) se elimina en el corte 1, al existir el primer endpoint real.

---

## Corte 1: Fundaciones ⬜

**Guía:** [01-decisiones-y-stack](01-decisiones-y-stack.md) · [02-estructura-y-puesta-en-marcha](02-estructura-y-puesta-en-marcha.md) · [03-base-de-datos](03-base-de-datos.md) · [05-piezas-clave](05-piezas-clave.md)

**Listo cuando:** `docker compose up` y `pnpm run start:dev` levantan; `/health/ready` y `/docs` responden con el header `X-Request-Id`, y los logs JSON incluyen el `requestId`.

- [ ] Instalar las dependencias de la guía (`pnpm add -E …`, Prisma fijado en `^7`)
- [ ] `docker-compose.yml` con PostgreSQL 18 y `healthcheck`
- [ ] `.env` y `.env.example`; agregar `/src/platform/prisma/generated/` al `.gitignore`
- [ ] Scripts: `db:*`, `prisma:generate`, `prebuild`, `pretest`; `test:e2e` con `prisma generate`
- [ ] `platform/config/env.schema.ts` y `ConfigModule` con validación Zod
- [ ] `prisma.config.ts` y `prisma/schema.prisma` completo (schemas `sales`, `catalog`, `inventory`, `messaging`)
- [ ] Migración `init` con los `CHECK` a mano (`charged_amount >= 0`, `price > 0`…) y `uuidv7()`
- [ ] `PrismaModule` y `PrismaService` (cliente importado desde la carpeta generada)
- [ ] `shared-kernel/domain.errors.ts` (lo necesita el filtro HTTP; se adelanta desde el corte 2)
- [ ] `platform/observability/`: `request-context`, middleware, interceptor y `RequestAwareLogger`
- [ ] `platform/http/`: `configure-app` y `DomainExceptionFilter`
- [ ] `platform/health/`: `live` y `ready` (`/health/outbox` llega en el corte 4)
- [ ] Swagger en `/docs`, nuevo `main.ts` (puerto desde `ConfigService`) y nuevo `AppModule`
- [ ] Eliminar el "Hello World" del scaffold
- [ ] Tests: validación de `env.schema` y e2e de `X-Request-Id`
- [ ] Verificar que TypeScript 6, Vitest 4 y Prisma 7 funcionan juntos

---

## Corte 2: Dominio de Ventas ⬜

**Guía:** [05-piezas-clave](05-piezas-clave.md) · [06-tests](06-tests.md) · [producto](../producto.md) (reglas del negocio)

**Listo cuando:** `contracts/` no importa nada de `contexts/`, y las invariantes del dominio tienen tests unitarios que pasan, sin base de datos.

- [ ] `shared-kernel/`: `isbn.vo.ts` y `domain-event.ts`
- [ ] `contracts/`: `order-placed.event`, `get-book-price.query`, `reserve-stock.command`, `release-stock.command`, `stock.errors`
- [ ] `sales/domain/shared/`: `money.vo.ts` (decimal.js) y `specification.ts`
- [ ] `sales/domain/order/`: agregado `Order`, `OrderLine`, `OrderFactory`
- [ ] `sales/domain/customer/`: agregado `Customer`, `email.vo.ts`
- [ ] `sales/domain/pricing/`: `PricingService`, `PricingContext` y las specifications
- [ ] Puertos como `abstract class`: `OrderRepository`, `CheckoutLog`, `CatalogPricing`, `StockReservation`, `Notifier`, `PaymentGateway`, `CustomerRepository`
- [ ] `test/fakes/`
- [ ] Tests: `money.vo`, `order.aggregate`, `pricing.service` (ejemplos de la tabla de totales del producto)
- [ ] Regla de dependencias comprobada (`domain/` sin Nest ni Prisma)

---

## Corte 3: Catálogo e Inventario ⬜

**Guía:** [05-piezas-clave](05-piezas-clave.md) · [03-base-de-datos](03-base-de-datos.md) · [06-tests](06-tests.md)

**Listo cuando:** `GET /books/:isbn` responde; reservar sin stock lanza `OutOfStockError` y no cambia nada; los tests contra PostgreSQL real pasan.

- [ ] `CatalogModule`: `BookController` y `GetBookPriceHandler` (monto como `{ amount, currency }`)
- [ ] `InventoryModule`: `ReserveStockHandler` y `ReleaseStockHandler` (bloqueo en orden de ISBN)
- [ ] `prisma/seed.ts`: clientes, libros y stock de ejemplo
- [ ] Testcontainers con `postgres:18` y `vitest.config.e2e.ts` (`test/{integration,e2e}/**/*.spec.ts`)
- [ ] `vitest.config.ts` solo con `test/unit/**/*.spec.ts`
- [ ] Tests: `stock.handlers` (liberación doble, orden inverso sin interbloqueo)

---

## Corte 4: Outbox ⬜

**Guía:** [05-piezas-clave](05-piezas-clave.md) (Platform: el Outbox) · [06-tests](06-tests.md)

**Listo cuando:** los tests de integración del Outbox pasan, incluido el del `correlationId`.

- [ ] `outbox-consumer.ts`, `@OutboxHandler()` y `OutboxRegistry`
- [ ] `OutboxWriter` (`append(tx, events)`)
- [ ] `OutboxRelay` (SKIP LOCKED, fencing por `attempts`, orden por agregado)
- [ ] `OutboxHealthIndicator` y `GET /health/outbox`
- [ ] `OutboxModule` registrado en `AppModule`
- [ ] Tests: entrega única con dos relays, `FAILED` tras agotar intentos, bloqueo vencido, consumidor `external` sin transacción, restauración de `correlationId`

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
| — | — | — | — |

## Problemas abiertos

| Fecha | Corte | Problema | Estado |
|---|---|---|---|
| 2026-10-27 | 3 | No se ha comprobado si el entorno en la nube permite Docker y Testcontainers (PostgreSQL 18). Si no, los tests de integración y e2e correrán en local o en CI | Pendiente de verificar en el corte 1 |

## Bitácora

| Fecha | Qué se hizo |
|---|---|
| 2026-10-27 | Guía adaptada al estado de `apps/main-api` y dividida en `docs/` y `docs/backend/`. Se define este plan de cortes |
