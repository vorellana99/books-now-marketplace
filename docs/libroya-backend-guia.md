# LibroYa API: guía de implementación en NestJS

API REST de LibroYa construida con DDD, CQRS y arquitectura hexagonal. Los conceptos y el código del dominio son los de la guía DDD v5. Este documento solo cubre lo necesario para construir el backend. La **sección 0** explica el producto para cualquier lector; desde la sección 1, el contenido es técnico.

> [!caution] Estado de esta guía
> El diseño está revisado, pero **el código no se ha ejecutado**. La validación pendiente son los tests de integración y e2e contra PostgreSQL 18 real (sección 9). Hasta que pasen, considérala una base para implementar, no una implementación lista para producción.

---

## 0. El producto

### Qué es LibroYa

LibroYa es una **librería online propia**: la tienda compra sus libros, los publica en su catálogo y los vende directamente al público. Una persona entra, busca un libro, lo agrega al carrito y paga con tarjeta. La tienda confirma la compra por email y aparta las unidades vendidas para enviarlas.

No es un marketplace: no hay vendedores externos ni comisiones. Hay **un solo vendedor (LibroYa)**, un solo catálogo y un solo almacén. Los precios están en soles (`PEN`), y el diseño ya admite dólares (`USD`).

### Para qué existe

| Necesidad | Cómo la resuelve LibroYa |
|---|---|
| El comprador quiere encontrar y comprar un libro sin complicaciones | Catálogo con búsqueda, precio visible y compra en un solo paso |
| El comprador no quiere pagar algo que no se le puede entregar | Antes de cobrar, se **aparta el stock**. Si no hay unidades, no se cobra |
| El comprador no quiere que le cobren dos veces | Si la conexión falla y el comprador reintenta, **recibe el mismo pedido y no se le cobra otra vez** |
| La tienda no quiere vender más de lo que tiene | El stock nunca queda en negativo, aunque muchos compren a la vez |
| La tienda quiere premiar a sus clientes frecuentes | Los **clientes premium** tienen descuento y envío gratis |
| La tienda necesita saber qué pasó con cada compra | Cada compra tiene un identificador que aparece en todos sus registros, desde el pago hasta el email |

### Quiénes lo usan

| Actor | Qué hace | Disponible |
|---|---|---|
| 🧑 **Comprador** | Busca libros, compra y paga | Hoy (búsqueda en la Fase 10) |
| ⭐ **Cliente premium** | Lo mismo, con 10 % de descuento y envío gratis | Hoy (se marca en la BD; aún no hay forma de suscribirse) |
| 🧑‍💼 **Administrador de la tienda** | Crea libros, cambia precios, desactiva libros y carga stock | Fases 12 y 13 |
| 💳 **Pasarela de pago** (sistema externo) | Cobra y reembolsa | Hoy, simulada |
| ✉️ **Proveedor de email** (sistema externo) | Envía la confirmación de compra | Hoy, simulado (se escribe en el log) |

### El recorrido de una compra

```mermaid
flowchart LR
    A["🔎 Busca un libro<br/>o entra por su ISBN"] --> B["🛒 Arma el carrito<br/>libros y cantidades"]
    B --> C["💳 Paga con tarjeta"]
    C --> D{"¿Hay stock<br/>y el pago pasó?"}
    D -- Sí --> E["✅ Pedido creado<br/>se muestra el total cobrado"]
    E --> F["✉️ Email de confirmación"]
    E --> G["📦 Las unidades quedan<br/>apartadas para el envío"]
    D -- "No hay stock" --> X["❌ No se cobra nada"]
    D -- "Pago rechazado" --> Y["❌ Se devuelven las unidades<br/>y no se crea el pedido"]
```

Para el comprador, todo ocurre en una sola acción: o la compra sale completa (pedido creado, pago hecho y unidades apartadas), o no sale y no pierde nada.

### Reglas del negocio

| Regla | Detalle |
|---|---|
| **Precio del libro** | Lo define el catálogo. Al comprar, el título y el precio **se copian en el pedido**: si después el precio cambia, el pedido conserva el que pagó el cliente |
| **Descuento premium** | 10 % sobre el subtotal |
| **Costo de envío** | S/ 10.00 |
| **Envío gratis** | Si el subtotal (antes del descuento) es **de S/ 150.00 o más**, o si el cliente es premium |
| **Máximo por libro** | 10 unidades del mismo libro por pedido |
| **Una sola moneda** | Todos los libros de un pedido deben tener la misma moneda |
| **Redondeo** | El total se calcula con todos los decimales y se redondea **una sola vez**, a 2 decimales y con la mitad hacia arriba, justo antes de cobrar |
| **Libros desactivados** | Un libro no se borra: se desactiva. Ya no se puede comprar, pero los pedidos antiguos lo siguen mostrando |

**Ejemplos del total cobrado:**

| Cliente | Subtotal | Descuento | Envío | Total |
|---|---|---|---|---|
| Normal | S/ 100.00 | — | S/ 10.00 | **S/ 110.00** |
| Normal | S/ 160.00 | — | Gratis (≥ S/ 150) | **S/ 160.00** |
| Premium | S/ 100.00 | −S/ 10.00 | Gratis (premium) | **S/ 90.00** |
| Premium | S/ 200.00 | −S/ 20.00 | Gratis | **S/ 180.00** |

### Qué hace hoy y qué viene después

| Ya está en el diseño (fases 0–9) | Viene después (sección 11) | Fuera de alcance por ahora |
|---|---|---|
| Ver un libro por su ISBN | Buscar y listar libros (Fase 10) | Vendedores externos (marketplace) |
| Comprar y pagar con tarjeta | Dirección de envío en el pedido (Fase 11) | Cancelaciones y devoluciones |
| Ver un pedido | Administrar libros y precios (Fase 12) | Cupones y promociones |
| Email de confirmación | Cargar stock (Fase 13) | Envíos, factura electrónica (SUNAT) y puntos: el diseño ya los prevé como reacciones a la compra |
| Reintentos seguros y recuperación ante caídas | Historial de pedidos (Fase 14) · Inicio de sesión y roles (Fase 15) | |

> [!warning] Antes de abrirlo al público
> Mientras no exista el inicio de sesión (Fase 15), la API identifica al comprador por el `customerId` que viene en la petición. Sirve para desarrollar y probar, pero **no para producción**: cualquiera podría comprar a nombre de otro.

### Cómo se reparte el producto en el sistema

| Área del negocio | Contexto en el código | De qué se encarga |
|---|---|---|
| Qué libros vendemos y a qué precio | **Catálogo** (`catalog`) | Datos del libro, precio y si está activo |
| Cuántas unidades hay | **Inventario** (`inventory`) | Stock disponible y unidades apartadas por pedido |
| Clientes, pedidos y pagos | **Ventas** (`sales`) | Carrito, cálculo del total, cobro, pedido y confirmación |

Cada área es dueña de sus datos y solo se comunica con las demás por su API pública (sección 2).

### Palabras que se usan en esta guía

| Término | Significado |
|---|---|
| **ISBN** | Código de 13 dígitos que identifica a un libro |
| **Pedido** | Una compra completada: libros, cantidades, precios y total cobrado |
| **Checkout** | El intento de compra, desde que el comprador paga hasta que el pedido queda creado o anulado |
| **Reserva** | Unidades apartadas para un pedido, que ya no se pueden vender a otro |
| **Subtotal** | Suma de precio × cantidad de cada libro, antes de descuentos y envío |
| **Clave de idempotencia** (`Idempotency-Key`) | Identificador que la app del comprador envía con cada intento de compra, para que un reintento no cobre dos veces |

---

## 1. Decisiones y stack

| Tema | Decisión |
|---|---|
| Despliegue | **Monolito modular**: una app NestJS; cada bounded context es un módulo Nest con fronteras estrictas |
| Venta y pago | **Sincrónicos**: reservar stock, cobrar y guardar ocurren en la misma petición, con compensación inmediata si algo falla |
| Reintentos del cliente | `POST /orders` exige una **`Idempotency-Key`**: un reintento nunca crea otro pedido ni cobra dos veces |
| Caídas a mitad de la venta | **Saga mínima persistida**: un registro de *checkout* en la BD y un job que reembolsa y libera lo que quedó a medias |
| Eventos | **Solo para reacciones posteriores** (email, confirmar reserva y, más adelante, envíos, SUNAT y puntos), mediante un **Outbox confiable** |
| Base de datos | **PostgreSQL 18**, una BD con un **schema por contexto**: `sales`, `catalog`, `inventory` y `messaging` |
| Montos | **`Decimal` exacto en BD y dominio** (decimal.js en `Money`); en la API y los contratos, **texto con 2 decimales y moneda** (`{ amount: "90.00", currency: "PEN" }`) |
| Pagos y email | **Simulados**, elegidos por variable de entorno |
| Observabilidad | **Identificador de correlación** (`X-Request-Id`) en cada log, guardado en el checkout y en el outbox: una compra se sigue desde el `POST` hasta el último consumidor |
| Seguridad | Sin autenticación ni autorización **solo durante el desarrollo** (`customerId` viaja en el body). Antes de exponer la API, el cliente debe salir del token del usuario autenticado, nunca del body |

| Pieza | Versión | Para qué |
|---|---|---|
| Node.js | 24 LTS (≥ 24.15) | Runtime y CLI de Nest |
| NestJS | 12.x | Framework (ESM por defecto) |
| TypeScript | 6.x | El CLI de Nest 12 aún no soporta TS 7 |
| `@nestjs/cqrs` | compatible con Nest 12 | CommandBus y QueryBus |
| `@nestjs/config` | compatible con Nest 12 | Variables de entorno validadas con Zod |
| `@nestjs/swagger` | compatible con Nest 12 | OpenAPI en `/docs` |
| `@nestjs/schedule` | compatible con Nest 12 | Relay del Outbox y recuperación de checkouts |
| `@nestjs/terminus` | compatible con Nest 12 | `GET /health/live`, `GET /health/ready` (BD, para el balanceador) y `GET /health/outbox` (monitoreo) |
| Prisma ORM | **7.x (fijado)** | ORM con `@prisma/adapter-pg` |
| Vitest | 4.x (viene con `nest new`) | Tests unitarios, de integración y e2e |
| Testcontainers | `@testcontainers/postgresql` | PostgreSQL 18 real en los tests |

> [!warning] Fija Prisma en la versión 7
> Desde agosto de 2026, `npm install prisma` instala **Prisma 8 RC**, que cambia por completo la API. Instala siempre `prisma@^7`, `@prisma/client@^7` y `@prisma/adapter-pg@^7`.

> [!tip] Versiones reproducibles
> Instala con `-E` (versión exacta), sube el `package-lock.json` y valida el conjunto en CI. Confirma que TypeScript 6 y Vitest 4 son las versiones que instala el CLI de Nest 12 y que funcionan con Prisma 7 antes de empezar.

---

## 2. Arquitectura

### Qué es sincrónico y qué es un evento

```mermaid
flowchart TB
    Q1{"¿La respuesta al cliente<br/>depende de este paso?"}
    Q1 -- Sí --> SYNC["📞 Llamada directa<br/>dentro de la petición"]
    Q1 -- "No, puede<br/>pasar después" --> OUT["📨🔒 Evento con Outbox"]
```

```mermaid
flowchart LR
    subgraph SYNC["📞 Núcleo sincrónico: POST /orders"]
        P["Precio<br/>(Catálogo)"] --> R["Reservar stock<br/>(Inventario)"] --> C["Cobrar<br/>(pasarela)"] --> G["Guardar pedido<br/>+ OrderPlaced en el outbox"]
    end
    G -. "relay" .-> EV(("📨"))
    subgraph REAC["📨 Reacciones (consumidores del Outbox)"]
        E["✉️ Email de confirmación"]
        K["🏬 Confirmar reserva"]
        F["🚚 Envíos · 🧾 SUNAT · ⭐ Puntos<br/>(futuros)"]
    end
    EV --> E
    EV --> K
    EV -.-> F
```

### Módulos y dependencias

```mermaid
flowchart TB
    subgraph APP["libroya-api"]
        SALES["🛒 SalesModule"]
        CAT["📚 CatalogModule"]
        INV["🏬 InventoryModule"]
        CONTRACTS["📜 contracts/<br/>comandos, queries y eventos públicos"]
        subgraph PLATFORM["⚙️ platform/"]
            PRISMA["PrismaModule"]
            OUTBOX["OutboxModule<br/>writer, relay, registry"]
            HEALTH["HealthModule"]
        end
    end
    SALES -- "QueryBus: precio" --> CONTRACTS
    SALES -- "CommandBus: reservar/liberar" --> CONTRACTS
    CAT -- "implementa la query" --> CONTRACTS
    INV -- "implementa los comandos<br/>y consume OrderPlaced" --> CONTRACTS
    SALES --> OUTBOX
    INV --> OUTBOX
    APP --> PG[("🐘 PostgreSQL 18<br/>sales · catalog · inventory · messaging")]
```

**Reglas:**

1. **Un contexto nunca importa de otro contexto.** Solo de `contracts/` (Published Language) y `shared-kernel/`.
2. **Las llamadas directas van en una sola dirección:** Ventas llama a Catálogo e Inventario; **ninguno llama a Ventas**. Así no se forman ciclos.
3. **`domain/` no importa nada de Nest, Prisma ni `platform/`.** `application/` usa decoradores de Nest, pero no Prisma: los consumidores que necesitan la transacción (`tx`) van en `infrastructure/`.
4. **No hay transacciones, joins ni claves foráneas entre schemas de contextos.** Cada contexto escribe solo en el suyo. Dentro de un mismo schema sí se usan FK (ver la sección 5).
5. **Única excepción, explícita:** `messaging` no es un contexto, es infraestructura de la plataforma. El relay del Outbox puede confirmar **en una misma transacción** el efecto local de un consumidor (en el schema de su contexto) y la marca de su entrega en `messaging`. Si algún día un contexto se separa a otra BD, su consumidor deja de usar esa transacción y deduplica con una tabla *inbox* propia (patrón Inbox).

---

## 3. Estructura de carpetas

Parte de la estructura v5 (contexto → capa → módulo → archivo), con los ajustes de la tabla de abajo.

Los archivos sin marca son de las fases 0–9. Los marcados con **(fase N)** se agregan en la sección 11.

```text
libroya-api/
├── package.json
├── tsconfig.json
├── nest-cli.json
├── vitest.config.ts                  tests unitarios: test/unit/**/*.spec.ts
├── vitest.config.e2e.ts              integración y e2e: test/{integration,e2e}/**/*.spec.ts
├── docker-compose.yml                PostgreSQL 18
├── .env                              no se sube al repositorio
├── .gitignore                        incluye .env y src/platform/prisma/generated/
├── prisma.config.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── shared-kernel/
│   │   ├── isbn.vo.ts
│   │   ├── domain-event.ts           eventName, eventVersion, aggregateId, occurredOn
│   │   └── domain.errors.ts          DomainError, NotFoundError, ConflictError
│   │
│   ├── contracts/                    ← Published Language
│   │   ├── sales/
│   │   │   └── order-placed.event.ts
│   │   ├── catalog/
│   │   │   ├── get-book-price.query.ts
│   │   │   └── book-created.event.ts                       (fase 12)
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
│   │   ├── outbox/
│   │   │   ├── outbox.module.ts
│   │   │   ├── outbox-consumer.ts    DeliveryContext, DbOutboxConsumer, ExternalOutboxConsumer
│   │   │   ├── outbox-handler.decorator.ts
│   │   │   ├── outbox.registry.ts
│   │   │   ├── outbox.writer.ts
│   │   │   ├── outbox.relay.ts
│   │   │   └── outbox.health.ts
│   │   ├── observability/
│   │   │   ├── request-context.ts
│   │   │   ├── request-id.middleware.ts
│   │   │   ├── request-context.interceptor.ts
│   │   │   └── request-aware.logger.ts
│   │   ├── http/
│   │   │   ├── configure-app.ts
│   │   │   ├── domain-exception.filter.ts
│   │   │   └── admin-api-enabled.guard.ts                  (fase 12)
│   │   └── health/
│   │       ├── health.module.ts
│   │       ├── health.controller.ts
│   │       └── db.health.ts
│   │
│   └── contexts/
│       ├── sales/
│       │   ├── sales.module.ts
│       │   ├── domain/
│       │   │   ├── order/
│       │   │   │   ├── order.aggregate.ts
│       │   │   │   ├── order-line.entity.ts
│       │   │   │   ├── order.factory.ts
│       │   │   │   ├── shipping-address.vo.ts              (fase 11)
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
│       │   │   ├── get-order.query.ts
│       │   │   ├── list-customer-orders.query.ts           (fase 14)
│       │   │   ├── recover-checkouts.job.ts                saga: recupera checkouts a medias
│       │   │   └── send-order-confirmation.consumer.ts     consumidor `external` del Outbox
│       │   └── infrastructure/
│       │       ├── order/
│       │       │   ├── order.controller.ts
│       │       │   ├── place-order.dto.ts
│       │       │   ├── shipping-address.dto.ts             (fase 11)
│       │       │   ├── list-customer-orders.dto.ts         (fase 14)
│       │       │   ├── get-order.handler.ts
│       │       │   ├── list-customer-orders.handler.ts     (fase 14)
│       │       │   ├── prisma-order.repository.ts
│       │       │   ├── order.mapper.ts
│       │       │   ├── prisma-checkout-log.adapter.ts
│       │       │   ├── catalog-in-process.adapter.ts
│       │       │   ├── inventory-in-process.adapter.ts
│       │       │   └── console-notifier.adapter.ts
│       │       ├── customer/
│       │       │   └── prisma-customer.repository.ts
│       │       └── payment/
│       │           ├── fake-payment-gateway.adapter.ts
│       │           └── external-payment.adapter.ts
│       │
│       ├── catalog/
│       │   ├── catalog.module.ts
│       │   ├── application/book/
│       │   │   ├── search-books.query.ts                   (fase 10)
│       │   │   ├── create-book.command.ts                  (fase 12)
│       │   │   ├── update-book.command.ts                  (fase 12)
│       │   │   └── deactivate-book.command.ts              (fase 12)
│       │   └── infrastructure/book/                        todos usan Prisma directo
│       │       ├── book.controller.ts
│       │       ├── get-book-price.handler.ts
│       │       ├── search-books.dto.ts                     (fase 10)
│       │       ├── search-books.handler.ts                 (fase 10)
│       │       ├── admin-book.controller.ts                (fase 12) guard en la clase
│       │       ├── create-book.dto.ts                      (fase 12)
│       │       ├── update-book.dto.ts                      (fase 12)
│       │       ├── create-book.handler.ts                  (fase 12) libro + evento en 1 transacción
│       │       ├── update-book.handler.ts                  (fase 12)
│       │       └── deactivate-book.handler.ts              (fase 12)
│       │
│       ├── inventory/
│       │   ├── inventory.module.ts
│       │   ├── domain/stock/
│       │   │   └── stock-item.aggregate.ts
│       │   ├── application/stock/
│       │   │   └── add-stock.command.ts                    (fase 13)
│       │   └── infrastructure/stock/                       todos usan Prisma directo
│       │       ├── reserve-stock.handler.ts
│       │       ├── release-stock.handler.ts
│       │       ├── confirm-reservation.consumer.ts         consumidor `db` del Outbox
│       │       ├── create-stock-item.consumer.ts           (fase 12) consumidor `db`
│       │       ├── admin-stock.controller.ts               (fase 13) guard en la clase
│       │       ├── add-stock.dto.ts                        (fase 13)
│       │       └── add-stock.handler.ts                    (fase 13)
│       │
│       └── identity/                                       (fase 15) usuarios, roles y guards
│
└── test/
    ├── fakes/
    │   ├── in-memory-order.repository.ts
    │   ├── in-memory-checkout-log.ts
    │   ├── fake-stock-reservation.ts
    │   ├── fixed-catalog.ts
    │   └── customers.ts
    ├── unit/
    │   ├── money.vo.spec.ts
    │   ├── order.aggregate.spec.ts
    │   ├── pricing.service.spec.ts
    │   └── place-order.handler.spec.ts
    ├── integration/                                        PostgreSQL 18 con Testcontainers
    │   ├── outbox.relay.spec.ts
    │   ├── recover-checkouts.job.spec.ts
    │   └── stock.handlers.spec.ts
    └── e2e/
        └── orders.e2e.spec.ts
```

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
| **Inventario sin repositorio por ahora** | La reserva es un `UPDATE` atómico; un repositorio con bloqueo optimista no aportaría nada todavía. Por eso sus handlers usan Prisma directo y viven en `infrastructure/` (regla 3) |
| **Transacciones explícitas con `prisma.$transaction(tx => …)`** | Cada operación atómica vive en un solo lugar (nunca hay transacciones entre contextos), así que basta con pasar `tx`; sin librerías extra en un punto crítico |
| **Consumidores que escriben en BD van en `infrastructure/`** | Reciben el `tx` de Prisma; los que solo llaman a servicios externos quedan en `application/` |
| **`Money` con decimal.js** (en vez de céntimos `number`) | Exactitud con más de 2 decimales en valores intermedios (por ejemplo, el valor unitario sin IGV que exige SUNAT) y redondeo explícito al final |
| **Imports relativos con `.js`** | Proyecto ESM: `import { Order } from './order.aggregate.js'` |

---

## 4. Puesta en marcha

```bash
npx @nestjs/cli@12 new libroya-api            # elegir ESM (trae Vitest y oxlint)
cd libroya-api

npm i -E @nestjs/cqrs @nestjs/config @nestjs/swagger @nestjs/schedule @nestjs/terminus \
      class-validator class-transformer zod dotenv \
      @prisma/client@^7 @prisma/adapter-pg@^7 pg decimal.js
npm i -E -D prisma@^7 tsx @types/pg @testcontainers/postgresql supertest @types/supertest
```

- **`pg`** es el driver que usa `@prisma/adapter-pg`. Si tu versión del adaptador ya lo trae como dependencia, instalarlo explícitamente no causa problemas y fija su versión.
- **`tsx`** lo necesita el seed (`prisma.config.ts` lo ejecuta con `tsx prisma/seed.ts`).

**Scripts en `package.json`:**

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
    "test:e2e": "prisma generate && vitest run --config vitest.config.e2e.ts"
  }
}
```

El cliente generado está en `.gitignore`, así que **`prisma generate` debe correr antes de compilar o testear**, en local y en CI (de eso se encargan `prebuild` y `pretest`).

**`docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:18
    environment: { POSTGRES_USER: libroya, POSTGRES_PASSWORD: libroya, POSTGRES_DB: libroya }
    ports: ["5432:5432"]
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
npm run db:up                          # espera a que PostgreSQL esté listo
npx prisma migrate dev --name init     # crea los schemas sales, catalog, inventory y messaging, y sus tablas
npm run db:seed                        # clientes, libros y stock de ejemplo
npm run start:dev
```

> [!important] PostgreSQL 18 en todos lados
> El outbox usa `uuidv7()`, que solo existe desde PostgreSQL 18. La misma versión debe usarse en `docker-compose.yml`, en Testcontainers (`postgres:18`) y en CI; con una versión anterior, la migración falla.

**`.env`**

```env
DATABASE_URL=postgresql://libroya:libroya@localhost:5432/libroya
PORT=3000
PAYMENT_PROVIDER=fake            # fake | external
PAYMENT_API_URL=
OUTBOX_MAX_ATTEMPTS=8
CHECKOUT_RECOVERY_MINUTES=10     # debe superar la duración máxima del handler (no solo de la petición HTTP)
ADMIN_API_ENABLED=false          # endpoints /admin solo en desarrollo, hasta tener autenticación (sección 11)
```

**`platform/config/env.schema.ts`**: todo lo que llega de `.env` es texto; el schema lo convierte y valida al arrancar.

```ts
import { z } from 'zod';

const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.string().url().optional()); // `PAYMENT_API_URL=` vacío

export const envSchema = z
  .looseObject({                                    // deja pasar el resto de variables del proceso (Zod 3: z.object({…}).passthrough())
    DATABASE_URL: z.string().url(),
    PORT: z.coerce.number().int().default(3000),
    PAYMENT_PROVIDER: z.enum(['fake', 'external']).default('fake'),
    PAYMENT_API_URL: optionalUrl,
    OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(8),
    CHECKOUT_RECOVERY_MINUTES: z.coerce.number().int().min(2).default(10),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    ADMIN_API_ENABLED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  })
  .refine((e) => !(e.NODE_ENV === 'production' && e.ADMIN_API_ENABLED), {
    path: ['ADMIN_API_ENABLED'],
    message: 'Los endpoints /admin no pueden habilitarse en producción sin autenticación',
  })
  .refine((e) => e.PAYMENT_PROVIDER !== 'external' || Boolean(e.PAYMENT_API_URL), {
    path: ['PAYMENT_API_URL'],
    message: 'PAYMENT_API_URL es obligatoria con PAYMENT_PROVIDER=external',
  });

export type Env = z.infer<typeof envSchema>;
```

`ConfigModule` guarda el objeto que devuelve `validate` (ver `AppModule`), así que `config.get('PORT')` ya es un número. `ConfigService.get<number>` por sí solo **no** convierte: el tipo genérico solo le indica a TypeScript qué esperar. Si una variable es inválida, la app no arranca y el error dice cuál.

---

## 5. Base de datos con Prisma 7

```mermaid
erDiagram
    SALES_CUSTOMERS { uuid id PK
        text email UK
        boolean premium }
    SALES_ORDERS { uuid id PK
        uuid customer_id FK
        enum status "PLACED"
        numeric19_2 charged_amount
        enum currency "PEN | USD" }
    SALES_CHECKOUTS { uuid order_id PK
        uuid idempotency_key UK
        text request_hash
        text request_id "correlación"
        numeric19_2 charged_amount "al completar"
        enum currency "al completar"
        enum status "PENDING | COMPLETED | ABORTED"
        timestamptz started_at
        timestamptz locked_until "lo reclama un job" }
    SALES_ORDER_LINES { uuid order_id PK
        varchar13 isbn PK "referencia lógica a catalog"
        text title "snapshot"
        numeric19_6 unit_price "snapshot"
        enum currency
        int quantity }
    CATALOG_BOOKS { varchar13 isbn PK
        text title
        text author
        numeric19_2 price
        enum currency
        boolean active "no se borra: se desactiva" }
    INVENTORY_STOCK_ITEMS { varchar13 isbn PK
        int available
        int reserved }
    INVENTORY_RESERVATIONS { uuid order_id PK
        varchar13 isbn PK
        int quantity
        enum status "HELD | CONFIRMED"
        timestamptz created_at }
    MESSAGING_OUTBOX { uuid id PK "uuidv7()"
        text event_name
        int event_version
        text aggregate_id "UUID del pedido o ISBN del libro"
        jsonb payload
        timestamptz occurred_on
        text correlation_id "requestId de origen" }
    MESSAGING_DELIVERIES { uuid event_id PK
        text consumer PK
        enum status "PENDING | DONE | FAILED"
        int attempts
        timestamptz next_attempt_at
        timestamptz locked_until
        text last_error }
    SALES_CUSTOMERS ||--o{ SALES_ORDERS : "FK (mismo contexto)"
    SALES_ORDERS ||--|{ SALES_ORDER_LINES : "FK (mismo agregado)"
    MESSAGING_OUTBOX ||--|{ MESSAGING_DELIVERIES : "una por consumidor"
```

### Montos: tipos y escalas

| Qué guarda la columna | Tipo | Ejemplo |
|---|---|---|
| Importe final (total cobrado, precio de venta, pagos, reembolsos) | `Decimal @db.Decimal(19, 2)` | `orders.charged_amount`, `books.price` |
| Valor intermedio (precio unitario, valor sin impuestos) | `Decimal @db.Decimal(19, 6)` | `order_lines.unit_price` |
| Tasa o coeficiente (descuento, IGV, prorrateo) | `Decimal @db.Decimal(9, 6)` | `0.180000` (más adelante, al modelar impuestos) |
| Moneda | `enum` (`PEN`, `USD`) | Validada por la BD, no texto libre |

Prisma no permite declarar `CHECK` en el schema: agrégalos a mano en el SQL de la migración, por ejemplo `CHECK (charged_amount >= 0)` y `CHECK (price > 0)`.

### Relaciones: cuándo usar clave foránea

| Relación | ¿FK? | Ejemplo |
|---|---|---|
| Dentro de un agregado | ✅ Sí | `order_lines → orders` |
| Entre agregados del **mismo** contexto | ✅ Sí: el mismo módulo es dueño de ambas tablas | `orders → customers` |
| Entre **contextos distintos** | ❌ No: solo el ID, como referencia lógica | `order_lines.isbn` → `catalog.books` |

Una FK entre contextos ataría sus migraciones y haría imposible separarlos. La integridad que se pierde se compensa así:

- **Se valida al escribir, a través de la API del dueño:** si el libro no existe o está inactivo, `GetBookPriceQuery` falla y el pedido no se crea.
- **Lo que otros referencian no se borra:** Catálogo **desactiva** libros (`active = false`) en vez de eliminarlos.
- **Lo que debe quedar congelado se copia** (*snapshot*): `title` y `unit_price` se guardan en la línea al comprar. Si mañana el libro cambia de precio o de título, el pedido de ayer no cambia, y `GET /orders/:id` no necesita consultar a Catálogo.

Para otras necesidades: si un dato actual se consulta de vez en cuando, se usa la API pública (`QueryBus` + `contracts/`). Si se consulta muy seguido, se mantiene una copia local actualizada por eventos (proyección). Los reportes que cruzan contextos van en un schema aparte, alimentado por eventos.

**`prisma/schema.prisma`** (lo esencial)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/platform/prisma/generated"
}

datasource db {
  provider = "postgresql"
  schemas  = ["sales", "catalog", "inventory", "messaging"]
}

// ── sales ──────────────────────────────────────────────
model Customer {
  id      String  @id @db.Uuid
  email   String  @unique
  premium Boolean @default(false)
  orders  Order[]
  @@map("customers")
  @@schema("sales")
}

enum OrderStatus {
  PLACED
  @@schema("sales")
}

enum Currency {
  PEN
  USD
  @@schema("sales")
}

model Order {
  id           String      @id @db.Uuid
  customerId   String      @map("customer_id") @db.Uuid
  customer     Customer    @relation(fields: [customerId], references: [id])   // FK: mismo contexto
  status       OrderStatus
  chargedAmount Decimal    @map("charged_amount") @db.Decimal(19, 2)   // importe final: 2 decimales
  currency     Currency    @default(PEN)
  createdAt    DateTime    @default(now()) @map("created_at")
  lines        OrderLine[]
  @@map("orders")
  @@schema("sales")
}

enum CheckoutStatus {
  PENDING
  COMPLETED
  ABORTED
  @@schema("sales")
}

// Estado de la saga: un registro por intento de compra (y la memoria de su Idempotency-Key)
model Checkout {
  orderId        String         @id @map("order_id") @db.Uuid
  idempotencyKey String         @unique @map("idempotency_key") @db.Uuid   // dos peticiones con la misma clave: solo una entra
  requestHash    String         @map("request_hash")                       // detecta la misma clave con otro carrito
  requestId      String?        @map("request_id")                         // correlación: el job de recuperación lo reutiliza en sus logs
  chargedAmount  Decimal?       @map("charged_amount") @db.Decimal(19, 2)  // se guarda al completar, para responder reintentos
  currency       Currency?                                                 // junto con el monto: sin ella, un reintento no sabe la moneda
  status    CheckoutStatus @default(PENDING)
  startedAt   DateTime       @default(now()) @map("started_at")
  lockedUntil DateTime?      @map("locked_until")     // evita que dos jobs recuperen el mismo checkout
  @@index([status, startedAt])
  @@map("checkouts")
  @@schema("sales")
}

model OrderLine {
  orderId        String @map("order_id") @db.Uuid
  isbn           String @db.VarChar(13)                       // referencia lógica a catalog (sin FK)
  title          String                                    // snapshot al comprar
  unitPrice      Decimal  @map("unit_price") @db.Decimal(19, 6)  // snapshot; valor intermedio (luego, el valor unitario de SUNAT)
  currency       Currency @default(PEN)
  quantity       Int
  order          Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@id([orderId, isbn])
  @@map("order_lines")
  @@schema("sales")
}

// ── catalog ────────────────────────────────────────────
model Book {
  isbn       String @id @db.VarChar(13)
  title      String
  author     String
  price      Decimal         @db.Decimal(19, 2)      // precio final de venta
  currency   CatalogCurrency @default(PEN)
  active     Boolean         @default(true)          // los libros se desactivan, no se borran
  @@map("books")
  @@schema("catalog")
}

// Catálogo tiene su propio enum de moneda: usar el de `sales` crearía una dependencia entre schemas (regla 4)
enum CatalogCurrency {
  PEN
  USD
  @@map("Currency")
  @@schema("catalog")
}

// ── inventory ──────────────────────────────────────────
model StockItem {
  isbn      String @id @db.VarChar(13)
  available Int
  reserved  Int    @default(0)
  @@map("stock_items")
  @@schema("inventory")
}

enum ReservationStatus {
  HELD
  CONFIRMED
  @@schema("inventory")
}

model Reservation {
  orderId   String            @map("order_id") @db.Uuid
  isbn      String            @db.VarChar(13)
  quantity  Int
  status    ReservationStatus @default(HELD)
  createdAt DateTime          @default(now()) @map("created_at")
  @@id([orderId, isbn])
  @@index([status, createdAt])
  @@map("reservations")
  @@schema("inventory")
}

// ── messaging (solo lo usa platform/outbox) ────────────
model OutboxMessage {
  id           String     @id @default(dbgenerated("uuidv7()")) @db.Uuid
  eventName    String     @map("event_name")
  eventVersion Int        @map("event_version")
  aggregateId  String     @map("aggregate_id")            // texto: UUID de un pedido o ISBN de un libro; índice para el orden por agregado del relay
  payload      Json
  occurredOn   DateTime   @map("occurred_on")
  correlationId String?   @map("correlation_id")             // requestId de la petición que generó el evento
  deliveries   Delivery[]
  @@index([aggregateId])
  @@map("outbox")
  @@schema("messaging")
}

enum DeliveryStatus {
  PENDING
  DONE
  FAILED
  @@schema("messaging")
}

model Delivery {
  eventId       String         @map("event_id") @db.Uuid
  consumer      String
  status        DeliveryStatus @default(PENDING)
  attempts      Int            @default(0)
  nextAttemptAt DateTime       @default(now()) @map("next_attempt_at")
  lockedUntil   DateTime?      @map("locked_until")
  lastError     String?        @map("last_error")
  createdAt     DateTime       @default(now()) @map("created_at")
  event         OutboxMessage  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@id([eventId, consumer])
  @@index([status, nextAttemptAt])
  @@map("deliveries")
  @@schema("messaging")
}
```

**`prisma.config.ts`** (en Prisma 7 la URL va aquí, no en el schema)

```ts
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'tsx prisma/seed.ts' },
  datasource: { url: env('DATABASE_URL') },
});
```

**`platform/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client.js';   // NO desde '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    super({ adapter: new PrismaPg({ connectionString: config.getOrThrow('DATABASE_URL') }) });
  }
  onModuleInit() { return this.$connect(); }
  onModuleDestroy() { return this.$disconnect(); }
}
```

> [!important] El cliente se importa siempre desde la carpeta generada
> Con `output` propio, `@prisma/client` no conoce este schema. `PrismaClient` y el namespace `Prisma` (por ejemplo, `Prisma.TransactionClient` o `Prisma.PrismaClientKnownRequestError`) se importan desde `src/platform/prisma/generated/client.js`, con la ruta relativa que corresponda:
>
> ```ts
> import { Prisma } from '../../platform/prisma/generated/client.js';
> ```
>
> `env('DATABASE_URL')` en `prisma.config.ts` exige la variable **también para `prisma generate`**, aunque no se conecte. En CI defínela siempre (para el paso de `generate` basta un valor de ejemplo, como `postgresql://u:p@localhost:5432/db`).

**Transacciones:** cada operación atómica abre su propia transacción interactiva y pasa `tx` a quien deba participar. No hay transacciones implícitas: lo que no recibe `tx` está fuera.

```mermaid
flowchart LR
    A["Pedido + checkout + outbox"] --> R1["PrismaOrderRepository.save"]
    B["Reservar / liberar stock"] --> R2["Handlers de Inventario"]
    C["Efecto del consumidor + DONE"] --> R3["OutboxRelay.deliver"]
    R1 --> TX(["prisma.$transaction(async (tx) => …)"])
    R2 --> TX
    R3 --> TX
```

| Transacción | `timeout` | Por qué |
|---|---|---|
| Guardar pedido / reservar / liberar | 5 s (por defecto) | Solo hay operaciones en la BD |
| Entrega de un consumidor `db` | 5 s (por defecto) | Solo hay operaciones en la BD |
| Consumidor `external` | **Sin transacción** | Nunca se mantiene una transacción abierta mientras se espera la red. Su llamada externa lleva timeout propio (10 s) |

---

## 6. El flujo de un pedido

```mermaid
sequenceDiagram
    actor C as Cliente
    participant H as PlaceOrderHandler
    participant INV as Inventario (CommandBus)
    participant PG as Pasarela
    participant DB as PostgreSQL
    participant RL as OutboxRelay
    participant M as Email
    participant K as Confirmar reserva

    C->>H: POST /orders
    H->>DB: checkout PENDING
    H->>INV: ReserveStock(orderId, líneas)
    alt sin stock
        H->>DB: checkout ABORTED
        H-->>C: 422 OUT_OF_STOCK (no se cobró)
    end
    H->>PG: charge(monto, orderId)
    alt pago rechazado
        H->>INV: ReleaseStock(orderId)
        H->>DB: checkout ABORTED
        H-->>C: 422 PAYMENT_DECLINED
    end
    H->>DB: 🔒 pedido + checkout COMPLETED + outbox + entregas (1 transacción)
    alt falla al guardar
        H->>PG: refund(orderId)
        H->>INV: ReleaseStock(orderId)
        H->>DB: checkout ABORTED
        H-->>C: 500
    end
    H-->>C: 201 { orderId, charged }
    RL->>DB: reclama entregas (SKIP LOCKED)
    RL->>M: enviar confirmación (await)
    RL->>K: reserva HELD → CONFIRMED (await)
    RL->>DB: entregas → DONE
```

### La saga mínima: qué pasa si el proceso se cae

```mermaid
stateDiagram-v2
    [*] --> PENDING: inicio de POST /orders
    PENDING --> COMPLETED: pedido guardado (misma transacción)
    PENDING --> ABORTED: compensación en el handler
    PENDING --> ABORTED: RecoverCheckoutsJob<br/>(PENDING con más de 10 min)
    COMPLETED --> [*]
    ABORTED --> [*]
```

| Se cae… | Queda | Se resuelve con |
|---|---|---|
| Después de reservar, antes de cobrar | Checkout `PENDING`, reserva sin pedido | `RecoverCheckoutsJob`: reembolso (no hay cobro: no hace nada) y liberación |
| Después de cobrar, antes de guardar | Checkout `PENDING`, cobro y reserva sin pedido | `RecoverCheckoutsJob`: reembolsa y libera |
| El cobro excede el tiempo de espera (no se sabe si cobró) | Posible cobro sin pedido | El handler **reembolsa siempre** que se intentó cobrar (idempotente) |
| `save` confirmó en la BD, pero la respuesta se perdió | Pedido válido; el handler cree que falló | El handler ve el checkout `COMPLETED` y **no compensa** |
| … y además falla la revisión del checkout | Pedido válido (`COMPLETED`); el cliente recibe 500 | Nada que compensar. El cliente reintenta con la misma `Idempotency-Key` y recibe el pedido |
| La respuesta 201 se pierde en la red | El cliente no sabe si compró | El reintento con la misma `Idempotency-Key` devuelve el mismo pedido, **sin cobrar otra vez** |
| Durante una compensación (por ejemplo, falla el reembolso) | Checkout `PENDING` | `RecoverCheckoutsJob` la reintenta en cada vuelta |
| Después de guardar | Checkout `COMPLETED`; entregas pendientes | El relay las procesa al volver |
| A mitad de una entrega | Entrega bloqueada | El bloqueo vence a los 2 min y otra vuelta la retoma |

> [!warning] Requisito para la pasarela real
> El job reembolsa conociendo solo el `orderId`, incluso cuando no sabe si el cobro llegó a hacerse. La pasarela debe aceptar el `orderId` como **referencia o clave de idempotencia**, y permitir **anular o reembolsar por referencia** (sin efecto si no hubo cobro). Idealmente, también **consultar el estado de un cobro por referencia**, para resolver los timeouts sin adivinar. La pasarela simulada ya lo hace. Verifícalo antes de elegir la real.

---

## 7. Piezas clave

El código del dominio es el de la guía v5. Abajo solo va lo nuevo o lo que cambia.

### Dominio: `Money` con decimal.js

```ts
// sales/domain/shared/money.vo.ts: decimal.js, NUNCA Prisma.Decimal (regla 3)
import Decimal from 'decimal.js';

export type Currency = 'PEN' | 'USD';

export class Money {
  private constructor(readonly amount: Decimal, readonly currency: Currency) {}

  // Sin `number`: un float como 1.005 ya llega mal representado
  static of(value: string | Decimal, currency: Currency = 'PEN'): Money {
    const d = new Decimal(value);
    if (d.isNegative()) throw new DomainError('NEGATIVE_AMOUNT', 'El monto no puede ser negativo');
    return new Money(d, currency);
  }
  static zero(currency: Currency = 'PEN'): Money { return new Money(new Decimal(0), currency); }

  add(o: Money): Money { this.assertSame(o); return new Money(this.amount.plus(o.amount), this.currency); }
  multiply(factor: string | Decimal): Money { return new Money(this.amount.times(factor), this.currency); }

  // Importe final: 2 decimales, mitad hacia arriba. Explícito en cada uso, nunca con Decimal.set() global
  toFinal(): Money { return new Money(this.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP), this.currency); }

  equals(o: Money): boolean { return this.currency === o.currency && this.amount.equals(o.amount); }
  isGreaterOrEqualThan(o: Money): boolean { this.assertSame(o); return this.amount.gte(o.amount); }

  toFixed(): string { return this.amount.toFixed(2); }                         // "90.00"
  toJSON() { return { amount: this.toFixed(), currency: this.currency }; }   // formato de la API

  private assertSame(o: Money): void {
    if (o.currency !== this.currency) throw new DomainError('CURRENCY_MISMATCH', 'No se pueden operar monedas distintas');
  }
}
```

**Reglas de los montos:**

```mermaid
flowchart LR
    DB[("NUMERIC")] -- "Prisma.Decimal → toString()" --> M["Money<br/>(decimal.js)"]
    M -- "toFinal().amount.toString()" --> DB
    M -- "toJSON()" --> API["{ amount: '90.00', currency: 'PEN' }"]
    API2["Contratos y payload del Outbox"] -. "texto: '90.00'" .- M
```

1. **Se calcula con toda la precisión y se redondea una sola vez**, con `toFinal()`, antes de cobrar o guardar un importe final.
2. **El dominio nunca recibe `number`** como monto, y nunca compara con `===` o `>`: usa `equals` y `isGreaterOrEqualThan`.
3. **El mapper convierte en el borde a través de texto:** `Money.of(row.chargedAmount.toString(), row.currency)` al leer, y `chargedAmount: money.toFinal().amount.toString()` al escribir (Prisma acepta texto en columnas `Decimal`). `Prisma.Decimal` es una copia propia de decimal.js dentro del cliente generado, así que no se mezcla con la del dominio.
4. **Entre contextos y en la API, los montos viajan como texto** con 2 decimales y su moneda. Nunca como `number`.

**Cambios en el dominio de la guía v5:** `Money` pasa a la versión de arriba. `order.place()` crea el evento con `this.subtotal().toFixed()` (texto) en lugar de `this.subtotal().cents`. `PricingService` aplica el descuento con `multiply('0.90')` y el envío con `Money.of('10.00')`; `MinimumSubtotalSpec` usa `Money.of('150.00')`. El adaptador de la pasarela convierte el `Money` final al formato que pida el proveedor (por ejemplo, céntimos enteros: `money.toFinal().amount.times(100).toNumber()`).

### Dominio: puertos y eventos

```ts
// sales/domain/order/stock-reservation.port.ts
export abstract class StockReservation {
  abstract reserve(orderId: string, lines: { isbn: string; quantity: number }[]): Promise<void>; // lanza OutOfStockError
  abstract release(orderId: string): Promise<void>;
}

// sales/domain/order/order.repository.ts
export abstract class OrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  abstract save(order: Order, charged: Money): Promise<void>;         // también marca el checkout COMPLETED
  abstract nextId(): string;
}

// sales/domain/order/checkout-log.port.ts: el estado de la saga
export abstract class CheckoutLog {
  abstract start(orderId: string, idempotencyKey: string, requestHash: string): Promise<boolean>; // false si la clave ya existe
  abstract findByKey(idempotencyKey: string): Promise<CheckoutRecord | null>;  // { orderId, status, requestHash, charged: Money | null }: Money.of(chargedAmount.toString(), currency)
  abstract isCompleted(orderId: string): Promise<boolean>;            // ¿el pedido llegó a guardarse?
  abstract abort(orderId: string): Promise<void>;                     // PENDING → ABORTED (nunca toca COMPLETED)
  abstract claimStale(olderThanMinutes: number): Promise<{ orderId: string; requestId: string | null }[]>; // reclama PENDING antiguos (SKIP LOCKED)
}
```

```ts
// shared-kernel/domain-event.ts
export interface DomainEvent {
  readonly eventName: string;
  readonly eventVersion: number;   // para cambiar el formato sin romper a los consumidores
  readonly aggregateId: string;
  readonly occurredOn: Date;
}

// contracts/sales/order-placed.event.ts
export class OrderPlacedEvent implements DomainEvent {
  readonly eventName = 'sales.order.placed';
  readonly eventVersion = 1;
  readonly occurredOn = new Date();
  readonly aggregateId: string;   // propiedad real (no getter), para que también viaje en el payload JSON
  constructor(
    readonly orderId: string,
    readonly customerId: string,
    readonly subtotal: string,                  // "100.00": los montos viajan como texto
    readonly lines: { isbn: string; quantity: number }[],
  ) {
    this.aggregateId = orderId;
  }
}
```

```ts
// shared-kernel/domain.errors.ts: el filtro HTTP decide el código según la clase
export class DomainError extends Error {                       // → 422
  constructor(readonly code: string, message: string) { super(message); }
}
export class NotFoundError extends DomainError {                // → 404
  constructor(entity: string, id: string) { super('NOT_FOUND', `${entity} ${id} no existe`); }
}
export class ConflictError extends DomainError {}               // → 409

// contracts/inventory/stock.errors.ts
export class OutOfStockError extends DomainError {              // → 422
  constructor(isbn: string) { super('OUT_OF_STOCK', `Sin stock suficiente para ${isbn}`); }
}
export class StockItemNotFoundError extends DomainError {       // → 422 (no 404: el libro existe en Catálogo)
  constructor(isbn: string) { super('STOCK_ITEM_NOT_FOUND', `No hay registro de stock para ${isbn}`); }
}
```

`order.place()` registra `OrderPlacedEvent`, como en la guía. Los consumidores reciben el **payload como JSON**: los eventos no deben tener métodos ni depender de que las fechas lleguen como `Date`.

### Application: el handler con compensaciones (la saga)

```ts
// sales/application/order/place-order.handler.ts
@CommandHandler(PlaceOrderCommand)
export class PlaceOrderHandler implements ICommandHandler<PlaceOrderCommand> {
  private readonly logger = new Logger(PlaceOrderHandler.name);

  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerRepository,
    private readonly catalog: CatalogPricing,
    private readonly stock: StockReservation,
    private readonly checkouts: CheckoutLog,
    private readonly pricing: PricingService,
    private readonly payments: PaymentGateway,
  ) {}

  async execute(cmd: PlaceOrderCommand) {
    // 0. Idempotencia: un reintento con la misma clave nunca crea otro pedido ni cobra otra vez
    const requestHash = hashRequest(cmd.customerId, cmd.items);
    const previous = await this.checkouts.findByKey(cmd.idempotencyKey);
    if (previous) return this.replay(previous, requestHash);

    // 1. Sin efectos: validar, pedir precios, armar el pedido y calcular el total
    const customer = await this.customers.findById(cmd.customerId);
    if (!customer) throw new NotFoundError('Customer', cmd.customerId);
    const order = OrderFactory.fromCart(this.orders.nextId(), customer.id, await this.catalog.priceCart(cmd.items));
    const finalPrice = this.pricing.calculateFinalPrice(order, customer, freeShippingSpec.isSatisfiedBy({ order, customer })).toFinal();
    const lines = order.getLines().map((l) => ({ isbn: l.isbn.value, quantity: l.quantity }));

    // 2. Efectos, en orden; si algo falla, se deshace lo hecho
    if (!(await this.checkouts.start(order.id, cmd.idempotencyKey, requestHash))) {
      // Otra petición con la misma clave entró justo antes (la clave es única en la BD)
      return this.replay((await this.checkouts.findByKey(cmd.idempotencyKey))!, requestHash);
    }
    // Desde aquí, si el proceso cae, el job recupera el checkout
    let chargeAttempted = false;
    try {
      await this.stock.reserve(order.id, lines);                     // sin stock → no reservó nada; release no hace nada
      chargeAttempted = true;
      const payment = await this.payments.charge(finalPrice, cmd.cardToken, order.id);
      if (!payment.approved) throw new DomainError('PAYMENT_DECLINED', `Pago rechazado: ${payment.reason}`);
      order.place();
      await this.orders.save(order, finalPrice);                      // pedido + checkout COMPLETED + outbox
    } catch (e) {
      if (await this.checkouts.isCompleted(order.id)) {               // el commit sí ocurrió: no compensar
        return { orderId: order.id, charged: finalPrice };
      }
      try {
        if (chargeAttempted) await this.payments.refund(order.id);   // idempotente: cubre rechazos y timeouts
        await this.stock.release(order.id);
        await this.checkouts.abort(order.id);                         // solo si TODAS las compensaciones terminaron
      } catch (compensationError) {
        // No se marca ABORTED: queda PENDING y RecoverCheckoutsJob reintenta las compensaciones
        this.logger.error(`Compensación incompleta para ${order.id}: ${String(compensationError)}`);
      }
      throw e;                                                        // el cliente recibe el error original
    }
    return { orderId: order.id, charged: finalPrice };
  }

  // Responde un reintento según cómo terminó el intento original
  private replay(c: CheckoutRecord, requestHash: string) {
    if (c.requestHash !== requestHash) {
      throw new DomainError('IDEMPOTENCY_KEY_REUSED', 'Esta Idempotency-Key ya se usó con otro carrito');
    }
    if (c.status === 'COMPLETED') return { orderId: c.orderId, charged: c.charged! };
    if (c.status === 'PENDING') throw new ConflictError('CHECKOUT_IN_PROGRESS', 'Esta compra todavía se está procesando');
    throw new DomainError('PREVIOUS_ATTEMPT_FAILED', 'El intento anterior con esta clave falló; usa una clave nueva');
  }
}

// Mismo cliente y mismo carrito → mismo hash. Fusiona las cantidades del mismo ISBN (como hace el agregado)
// y ordena, así {A:1, A:2} y {A:2, A:1} producen el mismo hash que {A:3}
function hashRequest(customerId: string, items: CartItem[]): string {
  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.isbn, (merged.get(i.isbn) ?? 0) + i.quantity);
  const lines = [...merged].sort(([a], [b]) => a.localeCompare(b)).map(([isbn, q]) => `${isbn}:${q}`).join(',');
  return createHash('sha256').update(`${customerId}|${lines}`).digest('hex');
}
```

**Cómo responde un reintento** con la misma `Idempotency-Key`:

```mermaid
flowchart TB
    R["POST /orders<br/>con una Idempotency-Key ya usada"] --> H{"¿Mismo carrito?"}
    H -- No --> E1["422 IDEMPOTENCY_KEY_REUSED"]
    H -- Sí --> S{"¿Cómo terminó el intento original?"}
    S -- COMPLETED --> OK["201 con el mismo orderId y monto<br/>(no se cobra otra vez)"]
    S -- PENDING --> E2["409 CHECKOUT_IN_PROGRESS<br/>(reintentar más tarde)"]
    S -- ABORTED --> E3["422 PREVIOUS_ATTEMPT_FAILED<br/>(usar una clave nueva)"]
```

- **El cliente genera la clave** (un UUID) **una vez por intento de compra** y la reutiliza en todos los reintentos de ese intento.
- **Dos peticiones simultáneas con la misma clave:** el índice único deja entrar solo a una; la otra recibe 409 mientras la primera termina.

- **`charged` es un `Money` ya redondeado** (`toFinal()`). Se serializa con `toJSON()` como `{ amount: "90.00", currency: "PEN" }`, igual en el primer 201, en un reintento y en `GET /orders/:id`.
- **Se reembolsa siempre que se intentó cobrar.** Si el cobro excedió el tiempo de espera, no se sabe si la pasarela cobró. Como el reembolso por referencia es idempotente y no hace nada si no hubo cobro, llamarlo siempre es lo seguro.
- **Antes de compensar se revisa el checkout.** Si `save` confirmó en la BD pero la respuesta se perdió (commit ambiguo), el checkout ya está `COMPLETED` y el pedido es válido: no se toca.
- **Si esa revisión también falla** (por ejemplo, cayó la BD), el error sube sin compensar. Hay dos casos:
  - **`save` no llegó a confirmar:** el checkout sigue `PENDING`, y el job reembolsa y libera después.
  - **`save` sí confirmó:** el checkout está `COMPLETED` y el pedido es válido. No hay nada que compensar (el job nunca toca un `COMPLETED`), aunque el cliente recibió un error. Si reintenta con la misma `Idempotency-Key`, recibe el pedido ya creado (ver más abajo).
- **`ABORTED` solo se marca cuando todas las compensaciones terminaron.** Si el reembolso o la liberación fallan, el checkout queda `PENDING` (recuperable), se registra el error y el cliente recibe el error original, no el de la compensación.
- **Toda llamada externa lleva timeout:** `fetch(url, { …, signal: AbortSignal.timeout(10_000) })` en `ExternalPaymentAdapter`. Sin él, una pasarela colgada retendría la petición indefinidamente.

### Application: el job de recuperación

```ts
// sales/application/order/recover-checkouts.job.ts
@Injectable()
export class RecoverCheckoutsJob {
  private readonly logger = new Logger(RecoverCheckoutsJob.name);

  constructor(
    private readonly checkouts: CheckoutLog,
    private readonly payments: PaymentGateway,
    private readonly stock: StockReservation,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async run(): Promise<number> {
    const stale = await this.checkouts.claimStale(this.config.get<number>('CHECKOUT_RECOVERY_MINUTES', 10));
    for (const { orderId, requestId } of stale) {
      // Los logs de la recuperación llevan el mismo requestId que la compra original
      await RequestContext.run(requestId ?? `recovery-${orderId}`, async () => {
        try {
          await this.payments.refund(orderId);     // idempotente: sin cobro previo, no hace nada
          await this.stock.release(orderId);       // idempotente
          await this.checkouts.abort(orderId);
          this.logger.warn(`Checkout ${orderId} recuperado: reembolsado y liberado`);
        } catch (e) {
          this.logger.error(`No se pudo recuperar ${orderId}; se reintenta en la próxima vuelta: ${e}`);
        }
      });
    }
    return stale.length;
  }
}
```

- **El umbral (10 min) debe superar la duración máxima del handler**, no solo la de la petición HTTP: aunque el cliente se desconecte, el handler sigue ejecutándose. Esa duración está acotada por los timeouts de cada paso (BD 5 s, pasarela 10 s); en el peor caso, con compensaciones, es menos de 1 minuto.
- **Con varias instancias, cada job reclama checkouts distintos** (`SKIP LOCKED` y un bloqueo de 2 min). Aun así, los tres pasos son idempotentes y `abort` solo cambia filas `PENDING`.
- **Misma regla que el relay: lote × duración máxima por checkout < bloqueo** (5 × 15 s = 75 s < 120 s). Si el lote tardara más, otra instancia retomaría checkouts que este job todavía no procesó, y se reembolsarían dos veces en la pasarela (sin error de datos, pero con llamadas duplicadas). Los checkouts que no entren en una vuelta se toman en la siguiente, 5 min después.

```ts
// sales/infrastructure/order/prisma-checkout-log.adapter.ts (fragmento)
async start(orderId: string, idempotencyKey: string, requestHash: string): Promise<boolean> {
  try {
    await this.prisma.checkout.create({
      data: { orderId, idempotencyKey, requestHash, requestId: RequestContext.requestId() ?? null },
    });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return false; // clave repetida
    throw e;
  }
}

async claimStale(olderThanMinutes: number): Promise<{ orderId: string; requestId: string | null }[]> {
  const rows = await this.prisma.$queryRaw<{ order_id: string; request_id: string | null }[]>`
    UPDATE sales.checkouts SET locked_until = now() + interval '2 minutes'
    WHERE order_id IN (
      SELECT order_id FROM sales.checkouts
      WHERE status = 'PENDING'
        AND started_at < now() - (${olderThanMinutes} * interval '1 minute')
        AND (locked_until IS NULL OR locked_until < now())
      LIMIT 5                -- 5 × ~15 s (reembolso 10 s + liberación 5 s) = 75 s < bloqueo de 2 min
      FOR UPDATE SKIP LOCKED)
    RETURNING order_id, request_id`;
  return rows.map((r) => ({ orderId: r.order_id, requestId: r.request_id }));
}

abort(orderId: string) {
  return this.prisma.checkout.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'ABORTED' } });
}
```

### Ventas llama a Catálogo e Inventario por `contracts/`

```ts
// sales/infrastructure/order/inventory-in-process.adapter.ts
@Injectable()
export class InventoryInProcessAdapter extends StockReservation {
  constructor(private readonly commandBus: CommandBus) { super(); }
  reserve(orderId: string, lines: { isbn: string; quantity: number }[]) {
    return this.commandBus.execute(new ReserveStockCommand(orderId, lines));
  }
  release(orderId: string) {
    return this.commandBus.execute(new ReleaseStockCommand(orderId));
  }
}
```

```ts
// sales/infrastructure/order/catalog-in-process.adapter.ts
@Injectable()
export class CatalogInProcessAdapter extends CatalogPricing {
  constructor(private readonly queryBus: QueryBus) { super(); }

  async priceCart(items: CartItem[]): Promise<PricedCartItem[]> {
    return Promise.all(items.map(async (i) => {
      const book = await this.queryBus.execute(new GetBookPriceQuery(i.isbn)); // NotFoundError si no existe o está inactivo
      // book.price es { amount: "45.00", currency: "PEN" }: se toman ambos, sin pasar por number
      return { isbn: i.isbn, quantity: i.quantity, title: book.title, price: book.price.amount, currency: book.price.currency };
    }));
  }
}
```

**Cambio en el dominio de la guía v5:** el título viaja como snapshot. `PricedCartItem` y `OrderLine` agregan `title`, y la factory lo pasa a `order.addBook(isbn, title, price, quantity)`. `PricedCartItem` lleva `price` como texto (`"45.00"`) y `currency`, y la factory los convierte con `Money.of(item.price, item.currency)`, sin pasar por `number`.

### Inventario: reserva atómica, liberación y confirmación

```ts
// inventory/infrastructure/stock/reserve-stock.handler.ts
@CommandHandler(ReserveStockCommand)
export class ReserveStockHandler implements ICommandHandler<ReserveStockCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ orderId, lines }: ReserveStockCommand): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Siempre en orden de ISBN: si dos pedidos con los libros {A, B} y {B, A} reservan a la vez,
      // ambos bloquean primero A y luego B, y no se produce un interbloqueo (deadlock)
      const sorted = [...lines].sort((a, b) => a.isbn.localeCompare(b.isbn));
      for (const { isbn, quantity } of sorted) {
        // Solo descuenta si alcanza: nunca queda en negativo, aunque haya pedidos simultáneos
        const { count } = await tx.stockItem.updateMany({
          where: { isbn, available: { gte: quantity } },
          data: { available: { decrement: quantity }, reserved: { increment: quantity } },
        });
        if (count === 0) {
          // Distingue "no alcanza" de "no existe el registro de stock" (dato inconsistente)
          const exists = await tx.stockItem.findUnique({ where: { isbn }, select: { isbn: true } });
          throw exists ? new OutOfStockError(isbn) : new StockItemNotFoundError(isbn);   // revierte todas las líneas
        }
      }
      await tx.reservation.createMany({ data: lines.map((l) => ({ orderId, ...l })) });
    });
  }
}
```

- **Las líneas llegan sin ISBN repetidos:** el agregado `Order` ya suma en una sola línea las unidades del mismo libro.
- **Toda transacción que toca `stock_items` bloquea las filas en orden de ISBN** (reservar y liberar). Es la regla que evita interbloqueos entre pedidos simultáneos; cualquier operación nueva sobre stock debe seguirla.
- **`StockItemNotFoundError`** (422, `STOCK_ITEM_NOT_FOUND`) indica un libro del catálogo sin registro de stock: además de rechazar la compra, se registra como error para corregir el dato.

```ts
// inventory/infrastructure/stock/release-stock.handler.ts: idempotente y segura bajo concurrencia
@CommandHandler(ReleaseStockCommand)
export class ReleaseStockHandler implements ICommandHandler<ReleaseStockCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ orderId }: ReleaseStockCommand): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Borra y devuelve en un solo paso. Si dos liberaciones corren a la vez, la segunda espera
      // el bloqueo de fila, ya no encuentra reservas y no devuelve el stock otra vez
      const released = await tx.$queryRaw<{ isbn: string; quantity: number }[]>`
        DELETE FROM inventory.reservations
        WHERE order_id = ${orderId}::uuid AND status = 'HELD'
        RETURNING isbn, quantity`;
      released.sort((a, b) => a.isbn.localeCompare(b.isbn));   // mismo orden de bloqueo que la reserva
      for (const r of released) {
        await tx.stockItem.update({
          where: { isbn: r.isbn },
          data: { available: { increment: r.quantity }, reserved: { decrement: r.quantity } },
        });
      }
    });
  }
}
```

```ts
// inventory/infrastructure/stock/confirm-reservation.consumer.ts
// Reacción a OrderPlaced: usa el tx del relay, así el efecto y la marca DONE se confirman juntos → una sola vez
@OutboxHandler()
@Injectable()
export class ConfirmReservationConsumer implements DbOutboxConsumer<OrderPlacedEvent> {
  readonly kind = 'db' as const;
  readonly name = 'inventory.confirm-reservation';
  readonly event = 'sales.order.placed';
  async handle(e: OrderPlacedEvent, { tx }: DbDeliveryContext): Promise<void> {
    await tx.reservation.updateMany({
      where: { orderId: e.orderId, status: 'HELD' },
      data: { status: 'CONFIRMED' },
    });
  }
}
```

Las reservas `HELD` sin pedido ya no necesitan un job propio en Inventario: las libera `RecoverCheckoutsJob` de Ventas, a través del mismo `ReleaseStockCommand`. Confirmar la reserva sirve para que Inventario distinga las reservas definitivas, que Envíos descontará más adelante.

### Ventas: guardar el pedido y su evento juntos

```ts
// sales/infrastructure/order/prisma-order.repository.ts
@Injectable()
export class PrismaOrderRepository extends OrderRepository {
  constructor(private readonly prisma: PrismaService, private readonly outbox: OutboxWriter) { super(); }

  nextId() { return randomUUID(); }

  async findById(id: string) {
    const row = await this.prisma.order.findUnique({ where: { id }, include: { lines: true } });
    return row ? OrderMapper.toDomain(row) : null;
  }

  async save(order: Order, charged: Money): Promise<void> {
    const events = order.pullEvents();
    await this.prisma.$transaction(async (tx) => {
      const chargedAmount = charged.toFinal().amount.toString();   // Prisma acepta texto en columnas Decimal
      await tx.order.create({ data: OrderMapper.toCreate(order, chargedAmount, charged.currency) });
      await tx.checkout.update({
        where: { orderId: order.id },
        data: { status: 'COMPLETED', chargedAmount, currency: charged.currency },   // monto y moneda, para los reintentos
      });
      await this.outbox.append(tx, events);                   // misma transacción: recibe tx
    });
  }
}
```

En esta fase los pedidos solo se crean. Cuando existan flujos que los modifiquen (por ejemplo, cancelar), se agrega una columna `version` con bloqueo optimista.

### Email: el primer consumidor

```ts
// sales/application/order/send-order-confirmation.consumer.ts
@OutboxHandler()
@Injectable()
export class SendOrderConfirmationConsumer implements ExternalOutboxConsumer<OrderPlacedEvent> {
  readonly kind = 'external' as const;      // el relay lo ejecuta fuera de toda transacción
  readonly name = 'sales.send-order-confirmation';
  readonly event = 'sales.order.placed';
  constructor(private readonly customers: CustomerRepository, private readonly notifier: Notifier) {}

  async handle(e: OrderPlacedEvent, { eventId }: DeliveryContext): Promise<void> {
    const customer = await this.customers.findById(e.customerId);
    if (!customer) return;
    // Servicio externo: se entrega "al menos una vez", con eventId como clave de idempotencia
    await this.notifier.send(customer.currentEmail.value, `¡Gracias! Tu pedido ${e.orderId} fue recibido.`, { idempotencyKey: eventId });
  }
}
```

**Cambio en el puerto de la guía v5:** `Notifier.send(to, message)` agrega un tercer parámetro opcional, `{ idempotencyKey?: string }`, que el adaptador real envía al proveedor de email.

### Platform: el Outbox

```mermaid
flowchart LR
    W["OutboxWriter<br/>append(tx, events)"] -- "misma transacción<br/>que el agregado" --> T[("outbox +<br/>deliveries")]
    REG["OutboxRegistry<br/>descubre @OutboxHandler"] -.-> W
    REG -.-> R
    R["OutboxRelay<br/>@Interval"] -- "1. reclama<br/>SKIP LOCKED" --> T
    R -- "2. await handle()<br/>db: + DONE en 1 transacción<br/>external: DONE después" --> CON["Consumidor"]
    R -- "3. si falla: reintento<br/>o FAILED" --> T
    HC["OutboxHealthIndicator"] -. "¿el relay sigue vivo?" .-> R
```

```ts
// platform/outbox/outbox-consumer.ts y outbox-handler.decorator.ts
export interface DeliveryContext {
  eventId: string;
  occurredOn: Date;
  attempt: number;
  correlationId: string | null;   // requestId de origen: un consumidor externo puede enviarlo al proveedor
}
export interface DbDeliveryContext extends DeliveryContext { tx: Prisma.TransactionClient }

// Efecto en la BD propia: el relay lo ejecuta dentro de su transacción, junto con la marca DONE
export interface DbOutboxConsumer<E> {
  readonly kind: 'db';
  readonly name: string;    // único: 'inventory.confirm-reservation'
  readonly event: string;   // 'sales.order.placed'
  handle(event: E, ctx: DbDeliveryContext): Promise<void>;
}

// Efecto externo (email, SUNAT): el relay lo ejecuta FUERA de toda transacción
export interface ExternalOutboxConsumer<E> {
  readonly kind: 'external';
  readonly name: string;
  readonly event: string;
  handle(event: E, ctx: DeliveryContext): Promise<void>;   // debe enviar ctx.eventId como clave de idempotencia
}

export type OutboxConsumer<E> = DbOutboxConsumer<E> | ExternalOutboxConsumer<E>;

export const OutboxHandler = DiscoveryService.createDecorator();
```

```ts
// platform/outbox/outbox.registry.ts
@Injectable()
export class OutboxRegistry implements OnModuleInit {
  private readonly byName = new Map<string, OutboxConsumer<unknown>>();
  private readonly byEvent = new Map<string, string[]>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit() {
    for (const { instance } of this.discovery.getProviders({ metadataKey: OutboxHandler.KEY })) {
      const c = instance as OutboxConsumer<unknown>;
      if (this.byName.has(c.name)) throw new Error(`Consumidor duplicado: ${c.name}`);
      this.byName.set(c.name, c);
      this.byEvent.set(c.event, [...(this.byEvent.get(c.event) ?? []), c.name]);
    }
  }

  consumersOf(eventName: string): string[] { return this.byEvent.get(eventName) ?? []; }
  get(name: string): OutboxConsumer<unknown> | undefined { return this.byName.get(name); }
}
```

```ts
// platform/outbox/outbox.writer.ts
@Injectable()
export class OutboxWriter {
  constructor(private readonly registry: OutboxRegistry) {}

  // Siempre recibe la transacción de quien guarda el agregado: nunca abre la suya
  async append(tx: Prisma.TransactionClient, events: DomainEvent[]): Promise<void> {
    for (const e of events) {
      const consumers = this.registry.consumersOf(e.eventName);
      if (consumers.length === 0) continue;   // nadie escucha este evento todavía
      const { id } = await tx.outboxMessage.create({
        data: {
          eventName: e.eventName, eventVersion: e.eventVersion, aggregateId: e.aggregateId,
          payload: JSON.parse(JSON.stringify(e)), occurredOn: e.occurredOn,
          correlationId: RequestContext.requestId() ?? null,   // fuera del payload: es un dato técnico, no de negocio
        },
      });
      await tx.delivery.createMany({ data: consumers.map((consumer) => ({ eventId: id, consumer })) });
    }
  }
}
```

Las entregas se crean al escribir el evento. Un consumidor nuevo solo recibe los eventos que se guarden **después** de desplegarlo.

**Las tres reglas del relay:**

| Regla | Por qué |
|---|---|
| **Lote × duración máxima por entrega < bloqueo** (10 × 10 s = 100 s < 2 min) | Si el lote tardara más que el bloqueo, otra instancia reclamaría entregas que todavía esperan en la cola de esta, y se procesarían dos veces |
| **Fencing por `attempts`** en cada actualización | Si el bloqueo venció y otra instancia reclamó la entrega, la instancia lenta no pisa su estado (por ejemplo, devolver a PENDING algo que ya está DONE). En un consumidor `db`, además, revierte el efecto |
| **Orden por agregado y consumidor** | Un consumidor nunca procesa un evento de un pedido antes que otro anterior del mismo pedido (por ejemplo, `OrderCancelled` antes que `OrderPlaced`). Si un evento queda FAILED, los posteriores de ese mismo pedido y consumidor siguen adelante; si un consumidor necesita orden estricto incluso con fallos, debe incluir `FAILED` en el `NOT EXISTS` |

```ts
// platform/outbox/outbox.relay.ts
const LEASE_MS = 2 * 60_000;   // bloqueo de cada entrega reclamada
const BATCH = 10;              // BATCH × duración máxima por entrega (10 s) = 100 s < LEASE_MS

type Claimed = {
  eventId: string; consumer: string; attempts: number;
  payload: unknown; occurredOn: Date; correlationId: string | null;
};

class LeaseLostError extends Error {
  constructor(d: Claimed) { super(`Entrega ${d.consumer}/${d.eventId} reclamada por otra instancia`); }
}

@Injectable()
export class OutboxRelay {
  private readonly logger = new Logger(OutboxRelay.name);
  private running = false;
  private runStartedAt: number | null = null;
  private lastRunAt: number | null = null;

  // Viva si está en una vuelta que aún no supera el bloqueo, o si terminó una hace menos de 1 min.
  // Una vuelta legítima dura hasta ~100 s (10 × 10 s): mientras no supere LEASE_MS, cuenta como viva
  isAlive(now = Date.now()): boolean {
    if (this.running && this.runStartedAt !== null) return now - this.runStartedAt < LEASE_MS;
    return this.lastRunAt !== null && now - this.lastRunAt < 60_000;
  }

  get lastRunAtIso(): string | null {
    return this.lastRunAt === null ? null : new Date(this.lastRunAt).toISOString();
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OutboxRegistry,
    private readonly config: ConfigService,
  ) {}

  @Interval(1000)
  async tick(): Promise<void> {
    if (this.running) return;                  // una vuelta a la vez por instancia
    this.running = true;
    this.runStartedAt = Date.now();
    try {
      await this.runOnce();
      this.lastRunAt = Date.now();
    } catch (err) {
      this.logger.error(`Vuelta del relay fallida: ${String(err)}`);
    } finally {
      this.running = false;
      this.runStartedAt = null;
    }
  }

  async runOnce(): Promise<number> {
    // Reclama un lote acotado. SKIP LOCKED: dos instancias nunca toman la misma entrega.
    // NOT EXISTS: no adelanta un evento si el mismo consumidor tiene pendiente uno anterior
    // del mismo agregado (orden por agregado y consumidor).
    const claimed = await this.prisma.$queryRaw<Claimed[]>`
      WITH c AS (
        UPDATE messaging.deliveries d
        SET locked_until = now() + make_interval(secs => ${LEASE_MS / 1000}),
            attempts = d.attempts + 1
        WHERE (d.event_id, d.consumer) IN (
          SELECT d2.event_id, d2.consumer
          FROM messaging.deliveries d2
          JOIN messaging.outbox o2 ON o2.id = d2.event_id
          WHERE d2.status = 'PENDING' AND d2.next_attempt_at <= now()
            AND (d2.locked_until IS NULL OR d2.locked_until < now())
            AND NOT EXISTS (
              SELECT 1 FROM messaging.deliveries p
              JOIN messaging.outbox po ON po.id = p.event_id
              WHERE p.consumer = d2.consumer AND po.aggregate_id = o2.aggregate_id
                AND p.status = 'PENDING' AND p.event_id < d2.event_id)
          ORDER BY d2.event_id
          LIMIT ${BATCH}
          FOR UPDATE OF d2 SKIP LOCKED)
        RETURNING d.event_id, d.consumer, d.attempts)
      SELECT c.event_id AS "eventId", c.consumer, c.attempts, o.payload,
             o.occurred_on AS "occurredOn", o.correlation_id AS "correlationId"
      FROM c JOIN messaging.outbox o ON o.id = c.event_id
      ORDER BY c.event_id`;

    for (const d of claimed) {
      // Restaura el requestId de origen: los logs del consumidor (y los eventos que genere) lo heredan
      await RequestContext.run(d.correlationId ?? `event-${d.eventId}`, () => this.deliver(d));
    }
    return claimed.length;
  }

  private async deliver(d: Claimed): Promise<void> {
    // Fencing: cada actualización exige que la entrega siga siendo nuestra (mismo intento, aún PENDING).
    // Si el bloqueo venció y otra instancia la reclamó, attempts ya cambió y no pisamos su estado.
    const mine = { eventId: d.eventId, consumer: d.consumer, attempts: d.attempts, status: 'PENDING' as const };
    try {
      const consumer = this.registry.get(d.consumer);
      if (!consumer) throw new Error(`Consumidor no registrado: ${d.consumer}`);
      const ctx = { eventId: d.eventId, occurredOn: d.occurredOn, attempt: d.attempts, correlationId: d.correlationId };

      if (consumer.kind === 'db') {
        // Efecto local + DONE en la misma transacción. Si perdimos la entrega, se revierte también el efecto
        await this.prisma.$transaction(async (tx) => {
          await consumer.handle(d.payload, { ...ctx, tx });
          const { count } = await tx.delivery.updateMany({ where: mine, data: { status: 'DONE', lockedUntil: null } });
          if (count === 0) throw new LeaseLostError(d);
        });
      } else {
        // Efecto externo: ninguna transacción abierta mientras se espera la red.
        // Si el proceso cae entre estas dos líneas, se reintenta: por eso el proveedor recibe eventId
        await consumer.handle(d.payload, ctx);
        const { count } = await this.prisma.delivery.updateMany({ where: mine, data: { status: 'DONE', lockedUntil: null } });
        if (count === 0) this.logger.warn(`Entrega ${d.consumer}/${d.eventId} reclamada por otra instancia; puede repetirse (idempotencia por eventId)`);
      }
    } catch (err) {
      if (err instanceof LeaseLostError) {
        this.logger.warn(`Entrega ${d.consumer}/${d.eventId} reclamada por otra instancia; efecto revertido`);
        return;
      }
      const max = this.config.get<number>('OUTBOX_MAX_ATTEMPTS', 8);
      const failed = d.attempts >= max;
      const backoffMs = Math.min(2 ** d.attempts * 1000, 5 * 60_000);   // 2 s, 4 s, 8 s… hasta 5 min
      await this.prisma.delivery.updateMany({
        where: mine,                                                     // también con fencing
        data: {
          status: failed ? 'FAILED' : 'PENDING',
          nextAttemptAt: new Date(Date.now() + backoffMs),
          lockedUntil: null,
          lastError: String(err).slice(0, 1000),
        },
      });
      const msg = `Entrega ${d.consumer} de ${d.eventId}, intento ${d.attempts}: ${String(err)}`;
      failed ? this.logger.error(`FAILED. ${msg}`) : this.logger.warn(msg);
    }
  }
}
```

```ts
// platform/outbox/outbox.health.ts: lo usa GET /health/outbox
@Injectable()
export class OutboxHealthIndicator {
  constructor(
    private readonly relay: OutboxRelay,
    private readonly prisma: PrismaService,
    private readonly health: HealthIndicatorService,
  ) {}

  async check(key = 'outbox') {
    const indicator = this.health.check(key);
    const relayAlive = this.relay.isAlive();

    // Solo informativo: no cambia el estado
    const [failed, due] = await Promise.all([
      this.prisma.delivery.count({ where: { status: 'FAILED' } }),
      this.prisma.delivery.count({ where: { status: 'PENDING', nextAttemptAt: { lte: new Date() } } }),
    ]);

    const details = { relayLastRunAt: this.relay.lastRunAtIso, failed, due };
    return relayAlive ? indicator.up(details) : indicator.down(details);
  }
}
```

```ts
// platform/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DbHealthIndicator,           // SELECT 1
    private readonly outbox: OutboxHealthIndicator,
  ) {}

  @Get('live')
  live() { return { status: 'ok' }; }                                         // liveness: el proceso responde (no toca la BD)

  @Get('ready') @HealthCheck()
  ready() { return this.health.check([() => this.db.check()]); }             // readiness: para el balanceador (solo la BD)

  @Get('outbox') @HealthCheck()
  outboxStatus() { return this.health.check([() => this.outbox.check()]); }  // para monitoreo y alertas
}
```

> [!important] Cada endpoint tiene un solo uso
> - **`/health/live`** (liveness): solo dice que el proceso responde. Si consultara la BD, una caída de la base haría que el orquestador **reinicie** todas las instancias, sin arreglar nada.
> - **`/health/ready`** (readiness): consulta la BD. Si falla, el balanceador deja de enviar tráfico a esa instancia, pero no la reinicia.
> - **`/health/outbox`**: va a monitoreo y alertas. Si el balanceador lo usara, un proveedor de email lento sacaría de servicio todas las instancias, aunque las ventas funcionen.

**Reprocesar entregas fallidas** (sin autenticación no conviene un endpoint; se hace por SQL o con un script):

```sql
UPDATE messaging.deliveries
SET status = 'PENDING', attempts = 0, next_attempt_at = now(), last_error = NULL
WHERE status = 'FAILED' AND consumer = 'sales.send-order-confirmation';
```

`FAILED` no borra nada: el evento, su payload y `last_error` quedan en la BD para inspeccionarlos. Cada paso a `FAILED` se registra como error en el log; conéctalo a una alerta.

> [!note] Qué mide `/health/outbox` y qué no
> Marca **down** solo cuando el relay de esa instancia está detenido: no terminó una vuelta en el último minuto **y** no está en medio de una, o lleva una vuelta más larga que el bloqueo (2 min). Una vuelta legítima de hasta ~100 s cuenta como viva, así que el indicador no parpadea con cola continua. Así no hay falsos positivos: una entrega en espera de reintento, una bloqueada detrás de un evento anterior del mismo pedido o una `FAILED` antigua ya revisada **no** lo ponen en rojo. Las cantidades `failed` y `due` van en el detalle, para que el monitoreo alerte con sus propios umbrales (por ejemplo, `failed` creció o `due` lleva varios minutos alto).

| Garantía | Para |
|---|---|
| **Efecto único en la BD** (consumidores `db`) | El cambio en PostgreSQL y la marca DONE se confirman juntos: aunque la entrega se repita, el efecto queda aplicado una sola vez. Es una garantía de la transacción local, no universal |
| **Al menos una vez** (consumidores `external`) | La llamada externa no queda protegida por PostgreSQL y puede repetirse. Solo la clave de idempotencia (`eventId`), si el proveedor la acepta, evita el efecto doble |

### Platform: identificador de correlación

```mermaid
flowchart LR
    C["Cliente o balanceador<br/>X-Request-Id (opcional)"] --> MW["requestIdMiddleware<br/>usa el recibido o genera uno<br/>y lo deja en req"]
    MW --> BP["body-parser"]
    BP --> IC["RequestContextInterceptor<br/>abre el contexto"]
    IC --> H["Pipes, handler y logs<br/>requestId=r-7f3a"]
    H --> K[("checkouts.request_id")]
    H --> O[("outbox.correlation_id")]
    O --> R["Relay: RequestContext.run(r-7f3a)"]
    R --> CON["Consumidores<br/>requestId=r-7f3a"]
    K --> J["RecoverCheckoutsJob<br/>requestId=r-7f3a"]
```

```ts
// platform/observability/request-context.ts: AsyncLocalStorage nativo de Node, sin librerías
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();

export const RequestContext = {
  run<T>(requestId: string, fn: () => T): T { return storage.run({ requestId }, fn); },
  requestId(): string | undefined { return storage.getStore()?.requestId; },
};
```

```ts
// platform/observability/request-id.middleware.ts
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

// Solo decide el ID y lo devuelve. NO abre el contexto: el body-parser, que corre después,
// continúa desde eventos del stream y lo perdería (problema conocido de AsyncLocalStorage con Express)
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  // Solo se acepta un valor con formato razonable: evita inyectar texto arbitrario en los logs
  const requestId = incoming && /^[\w.-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);   // el cliente puede reportarlo
  next();
}
```

```ts
// platform/observability/request-context.interceptor.ts
// Abre el contexto DESPUÉS del body-parser y antes de los pipes: validación, handler y todo lo que llamen lo heredan
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const requestId: string = ctx.switchToHttp().getRequest().requestId;
    return new Observable((subscriber) =>
      RequestContext.run(requestId, () => next.handle().subscribe(subscriber)),
    );
  }
}
```

```ts
// platform/observability/request-aware.logger.ts: agrega el requestId a cada línea del log JSON
export class RequestAwareLogger extends ConsoleLogger {
  override log(message: unknown, ...rest: unknown[]) { super.log(this.tag(message), ...rest); }
  override warn(message: unknown, ...rest: unknown[]) { super.warn(this.tag(message), ...rest); }
  override error(message: unknown, ...rest: unknown[]) { super.error(this.tag(message), ...rest); }

  private tag(message: unknown) {
    const requestId = RequestContext.requestId();
    return requestId ? { requestId, message } : message;
  }
}
```

- **Todo `new Logger(...)` de la app usa este logger** (se registra en `main.ts`), así que el `requestId` aparece sin cambiar ningún handler ni consumidor.
- **El ID viaja guardado en la BD:** en `checkouts.request_id` (lo reutiliza el job de recuperación) y en `outbox.correlation_id` (lo restaura el relay). Va fuera del payload, porque es un dato técnico.
- **Es diagnóstico, no lógica de negocio:** si en algún punto el contexto se perdiera, el log saldría sin `requestId`, pero ningún cobro, reserva o entrega cambia.
- **Middleware e interceptor se registran en `configureApp`:** el middleware primero (para que toda respuesta lleve el header, incluso un 400), y el interceptor como global. El test e2e de abajo comprueba que el `requestId` llega hasta el handler y los consumidores en un `POST` con cuerpo.
- **Los guards corren antes que los interceptores**, así que sus logs no llevarían `requestId`. Hoy el único guard es `AdminApiEnabledGuard` (sección 11), que no escribe logs; cuando llegue la autenticación, leer `req.requestId` directamente o abrir el contexto también ahí.
- **Siguiente paso natural:** OpenTelemetry (`traceparent`), que además mide tiempos por paso. La idea es la misma, así que este diseño se puede migrar.

### HTTP, errores y arranque

```ts
// sales/infrastructure/order/place-order.dto.ts: valida la forma; las reglas las protege el dominio
class CartItemDto {
  @ApiProperty({ example: '9780132350884' }) @IsString() @Length(13, 13) isbn!: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) quantity!: number;
}
export class PlaceOrderDto {
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiProperty() @IsString() cardToken!: string;
  @ApiProperty({ type: [CartItemDto] })
  @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CartItemDto)
  items!: CartItemDto[];
}

// sales/infrastructure/order/order.controller.ts
@ApiTags('orders')
@Controller('orders')
export class OrderController {
  constructor(private readonly commandBus: CommandBus, private readonly queryBus: QueryBus) {}

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID generado por el cliente, uno por intento de compra' })
  place(@Headers('idempotency-key') key: string | undefined, @Body() dto: PlaceOrderDto) {
    if (!key || !isUUID(key)) throw new BadRequestException('Falta el header Idempotency-Key (UUID)');
    return this.commandBus.execute(new PlaceOrderCommand(key, dto.customerId, dto.items, dto.cardToken));
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.queryBus.execute(new GetOrderQuery(id));   // lee directo con Prisma, sin agregado
  }
}
```

```ts
// platform/http/domain-exception.filter.ts
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost) {
    const status = error instanceof NotFoundError ? 404 : error instanceof ConflictError ? 409 : 422;
    host.switchToHttp().getResponse()
      .status(status)
      .json({ statusCode: status, errorCode: error.code, message: error.message });
  }
}

// platform/http/configure-app.ts: lo usan main.ts y los tests e2e
export function configureApp(app: INestApplication): void {
  app.use(requestIdMiddleware);                             // primero: toda respuesta lleva X-Request-Id
  app.useGlobalInterceptors(new RequestContextInterceptor());  // abre el contexto tras el body-parser
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
  app.enableShutdownHooks();
}
```

```ts
// contexts/sales/sales.module.ts
@Module({
  controllers: [OrderController],
  providers: [
    PlaceOrderHandler, GetOrderHandler, SendOrderConfirmationConsumer, RecoverCheckoutsJob, PricingService,
    { provide: OrderRepository, useClass: PrismaOrderRepository },
    { provide: CheckoutLog, useClass: PrismaCheckoutLog },
    { provide: CustomerRepository, useClass: PrismaCustomerRepository },
    { provide: CatalogPricing, useClass: CatalogInProcessAdapter },
    { provide: StockReservation, useClass: InventoryInProcessAdapter },
    { provide: Notifier, useClass: ConsoleNotifier },
    {
      provide: PaymentGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('PAYMENT_PROVIDER') === 'external'
          ? new ExternalPaymentAdapter(config.getOrThrow('PAYMENT_API_URL'))
          : new FakePaymentGateway(),
    },
  ],
})
export class SalesModule {}
```

Importa los puertos como **valor**, no con `import type`: Nest necesita la clase en runtime para inyectarla.

**Lo que conecta todo** (sin esto no hay buses, cron, descubrimiento de consumidores ni `/docs`):

```ts
// app.module.ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: (env) => envSchema.parse(env) }),
    CqrsModule.forRoot(),          // CommandBus y QueryBus
    ScheduleModule.forRoot(),      // @Interval del relay y @Cron del job de recuperación
    PrismaModule,                  // @Global: exporta PrismaService
    OutboxModule,                  // @Global: writer, registry y relay
    HealthModule,
    SalesModule, CatalogModule, InventoryModule,
  ],
})
export class AppModule {}

// platform/outbox/outbox.module.ts
@Global()
@Module({
  imports: [DiscoveryModule],      // OutboxRegistry encuentra los @OutboxHandler()
  providers: [OutboxRegistry, OutboxWriter, OutboxRelay],
  exports: [OutboxWriter, OutboxRelay],
})
export class OutboxModule {}

// platform/health/health.module.ts
@Module({
  imports: [TerminusModule],       // HealthCheckService y HealthIndicatorService
  controllers: [HealthController],
  providers: [DbHealthIndicator, OutboxHealthIndicator],
})
export class HealthModule {}
```

```ts
// main.ts
const app = await NestFactory.create(AppModule, { logger: new RequestAwareLogger({ json: true }) });
configureApp(app);

const doc = new DocumentBuilder()
  .setTitle('LibroYa API')
  .setVersion('1.0')
  .addGlobalParameters({ name: 'X-Request-Id', in: 'header', required: false, description: 'Opcional; si falta, la API genera uno' })
  .build();
SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, doc));

await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
```

Los consumidores del Outbox se registran en los `providers` del módulo de su contexto (por ejemplo, `ConfirmReservationConsumer` en `InventoryModule`). El registro los descubre por el decorador, sin importar en qué módulo estén.

---

## 8. Endpoints

| Método | Ruta | Respuesta | Errores (`errorCode`) |
|---|---|---|---|
| `POST` | `/orders` (header `Idempotency-Key`) | `201 { orderId, charged: { amount: "90.00", currency: "PEN" } }`, también al reintentar una compra completada | `400` DTO o falta la clave · `404 NOT_FOUND` · `409 CHECKOUT_IN_PROGRESS` · `422 OUT_OF_STOCK`, `PAYMENT_DECLINED`, `IDEMPOTENCY_KEY_REUSED`, `PREVIOUS_ATTEMPT_FAILED` o una regla del dominio |
| `GET` | `/orders/:id` | `200 { id, status, charged: { amount, currency }, lines[{ isbn, title, unitPrice: { amount, currency }, quantity }] }` | `404` |
| `GET` | `/books/:isbn` | `200 { isbn, title, author, price: { amount, currency } }` | `404` (no existe o está inactivo) |
| `GET` | `/health/live` | `200` si el proceso responde (liveness; no toca la BD) | — |
| `GET` | `/health/ready` | `200` si la BD responde (readiness; lo usa el balanceador) | `503` |
| `GET` | `/health/outbox` | `200` si el relay de esta instancia sigue completando vueltas; informa `failed` y `due` (lo usa el monitoreo) | `503` |
| `GET` | `/docs` | Swagger UI | — |

**Un pedido tiene una sola moneda.** Si el carrito mezcla libros en monedas distintas, `POST /orders` responde `422 CURRENCY_MISMATCH`.

**Todas las respuestas incluyen el header `X-Request-Id`.** Si la petición lo trae (con formato válido), se devuelve el mismo; si no, uno generado.

**Formato de los montos:** todo monto en la API es un objeto con **texto de 2 decimales y moneda**: `{ "amount": "45.00", "currency": "PEN" }`. Vale para `charged`, `unitPrice` y `price`, así que un libro se ve igual en `GET /books/:isbn` y en la línea del pedido. Punto como separador decimal, sin separador de miles. En `GET /orders/:id`, `unitPrice` (escala 6 en la BD) se muestra con 2 decimales; el valor completo queda en la BD para la facturación.

```ts
// catalog/infrastructure/book/get-book-price.handler.ts (fragmento)
return {
  isbn: book.isbn, title: book.title, author: book.author,
  price: { amount: book.price.toFixed(2), currency: book.currency },   // Prisma.Decimal → texto
};
```

---

## 9. Tests con Vitest

```mermaid
flowchart TB
    E2E["🔺 e2e: API + PostgreSQL 18<br/>flujo feliz, sin stock, pago rechazado"]
    INT["🔶 Integración: Outbox y recuperación + PostgreSQL 18<br/>reintentos, FAILED, SKIP LOCKED, caídas a mitad"]
    UNI["🟩 Unitarios: dominio y PlaceOrderHandler con fakes<br/>compensaciones"]
    E2E --- INT --- UNI
```

| Nivel | Casos mínimos |
|---|---|
| Unitarios | Invariantes del dominio · sin stock: no se cobra y el checkout queda ABORTED · pago rechazado: se libera el stock · falla al guardar: reembolso y liberación · **timeout del cobro: se reembolsa** · **commit ambiguo (`save` falla pero el checkout está COMPLETED): no compensa y responde 201** · **el reembolso falla: el checkout sigue PENDING y el cliente recibe el error original** · **reintento con la misma clave tras COMPLETED: mismo orderId y un solo cobro** · **misma clave con otro carrito: 422** · **el mismo carrito con líneas repetidas o en otro orden produce el mismo hash** · **`Money`: `Money.of('1.005').toFinal()` da `"1.01"`, y `toFinal()` redondea mitad hacia arriba** |
| Integración (Outbox) | Entrega y marca DONE · el consumidor falla: reintenta y luego FAILED · dos relays en paralelo: cada entrega una sola vez · bloqueo vencido: se retoma · un consumidor `external` corre sin transacción abierta · **bloqueo vencido: la instancia lenta no pisa el DONE de la otra (fencing) y revierte su efecto `db`** · **dos eventos del mismo pedido se entregan en orden** · **el relay restaura el `correlationId` del evento en los logs del consumidor** |
| Integración (saga e inventario) | Checkout PENDING antiguo con cobro: el job reembolsa, libera y queda ABORTED · un COMPLETED no se toca · si el reembolso falla, sigue PENDING y se reintenta · dos jobs en paralelo no toman el mismo checkout · **dos liberaciones simultáneas devuelven el stock una sola vez** · **dos pedidos con los mismos libros en orden inverso reservan a la vez sin interbloqueo** |
| e2e | `POST /orders` 201 y la reserva queda CONFIRMED · sin stock: 422 sin cobro · pago rechazado: 422 y stock intacto · **dos `POST` simultáneos con la misma clave: un pedido, un cobro, y la otra respuesta es 409 o el mismo pedido** · **`POST` con `X-Request-Id: r-test`: la respuesta lo devuelve, `checkouts.request_id` y `outbox.correlation_id` lo guardan, y el log del email lo incluye** · **sin el header, la respuesta trae uno generado** |

```ts
// test/unit/place-order.handler.spec.ts
it('si el pago es rechazado, libera el stock y no guarda el pedido', async () => {
  const stock = new FakeStockReservation();
  const orders = new InMemoryOrderRepository();
  const checkouts = new InMemoryCheckoutLog();
  const handler = new PlaceOrderHandler(orders, customersWithPremium(), fixedCatalog(), stock, checkouts,
    new PricingService(), new FakePaymentGateway({ approved: false, reason: 'fondos insuficientes' }));

  await expect(handler.execute(new PlaceOrderCommand(randomUUID(), 'c-1', [{ isbn: ISBN, quantity: 1 }], 'tok')))
    .rejects.toThrow(/Pago rechazado/);
  expect(stock.released).toHaveLength(1);
  expect(orders.count()).toBe(0);
  expect(checkouts.statusOf(stock.released[0])).toBe('ABORTED');
});

it('commit ambiguo: si el checkout quedó COMPLETED, no compensa', async () => {
  const orders = new InMemoryOrderRepository({ failAfterCommit: true }); // guarda y luego lanza un error
  const payments = new FakePaymentGateway({ approved: true });
  const handler = new PlaceOrderHandler(orders, customersWithPremium(), fixedCatalog(), new FakeStockReservation(),
    orders.checkoutLog, new PricingService(), payments);

  const result = await handler.execute(new PlaceOrderCommand(randomUUID(), 'c-1', [{ isbn: ISBN, quantity: 1 }], 'tok'));
  // fixedCatalog(): 1 libro a "100.00". Cliente premium: −10 % y envío gratis → se cobra "90.00"
  expect(result.charged.toJSON()).toEqual({ amount: '90.00', currency: 'PEN' });
  expect(payments.refunded).toHaveLength(0);
});
```

```ts
// test/integration/outbox.relay.spec.ts (PostgreSQL 18 con Testcontainers)
it('dos relays en paralelo entregan cada evento una sola vez', async () => {
  await seedEvents(20);                               // 20 eventos con un consumidor que cuenta llamadas
  await Promise.all([relayA.runOnce(), relayB.runOnce()]);
  expect(countingConsumer.calls).toBe(20);
  expect(await prisma.delivery.count({ where: { status: 'DONE' } })).toBe(20);
});

it('tras agotar los intentos, la entrega queda FAILED', async () => {
  failingConsumer.alwaysThrow = true;
  await seedEvents(1);
  for (let i = 0; i < MAX_ATTEMPTS; i++) { await makeDeliveriesDue(); await relay.runOnce(); }
  expect(await prisma.delivery.findFirst()).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
});

// test/integration/recover-checkouts.job.spec.ts
it('caída después de cobrar: el job reembolsa, libera y marca ABORTED', async () => {
  await simulateCrashAfterCharge(ORDER_ID);           // checkout PENDING, reserva HELD, cobro hecho, sin pedido
  await backdateCheckout(ORDER_ID, 11);               // lo deja con más de 10 min
  await job.run();
  expect(payments.refunded).toContain(ORDER_ID);
  expect(await prisma.reservation.count({ where: { orderId: ORDER_ID } })).toBe(0);
  expect(await prisma.checkout.findUnique({ where: { orderId: ORDER_ID } })).toMatchObject({ status: 'ABORTED' });
});
```

**Todos los tests de integración y e2e corren contra PostgreSQL 18 real** (Testcontainers): `SKIP LOCKED`, los bloqueos de fila, `DELETE … RETURNING` y `uuidv7()` no se pueden validar con fakes ni con otra base de datos.

En e2e se llama a `app.get(OutboxRelay).runOnce()` directamente, en vez de esperar al intervalo. Usa `import request from 'supertest'` (import por defecto). Agrega `vitest.config.e2e.ts` con `include: ['test/{integration,e2e}/**/*.spec.ts']`, y deja `vitest.config.ts` solo con `include: ['test/unit/**/*.spec.ts']`, para que `npm test` no necesite Docker.

---

## 10. Orden de implementación

```mermaid
flowchart LR
    F0["0. Scaffold"] --> F1["1. Platform<br/>config, Prisma, filtro,<br/>Swagger, health, requestId"]
    F1 --> F2["2. Shared kernel<br/>y contracts"]
    F2 --> F3["3. Dominio Ventas<br/>+ unitarios"]
    F3 --> F4["4. Catálogo"]
    F4 --> F5["5. Inventario<br/>reservar y liberar"]
    F5 --> F6["6. Outbox<br/>writer, relay<br/>+ tests de integración"]
    F6 --> F7["7. PlaceOrder + saga<br/>compensaciones, checkout<br/>y job de recuperación"]
    F7 --> F8["8. Consumidores<br/>email y confirmar reserva"]
    F8 --> F9["9. e2e completos"]
```

| Fase | Listo cuando… |
|---|---|
| 0–1 | `docker compose up` y `npm run start:dev` levantan; `/health/ready` y `/docs` responden, con el header `X-Request-Id`, y los logs JSON incluyen el `requestId` |
| 2–3 | `contracts/` no importa nada de `contexts/`; las invariantes tienen tests y pasan |
| 4–5 | `GET /books/:isbn` responde; reservar sin stock lanza `OutOfStockError` y no cambia nada |
| 6 | Los tests de integración del Outbox pasan, incluido el del `correlationId` |
| 7 | `POST /orders` devuelve 201; los casos de compensación (incluidos timeout y commit ambiguo) y los tests de recuperación pasan |
| 8 | Tras `POST /orders`, el email aparece en el log, la reserva queda `CONFIRMED` y `/health/outbox` responde 200 |
| 9 | Los e2e pasan: flujo feliz, sin stock y pago rechazado |

**Para agregar una reacción nueva más adelante** (Envíos, SUNAT o puntos): crea una clase con `@OutboxHandler()` que implemente `OutboxConsumer`, en el módulo que reacciona, y regístrala en sus `providers`. Ventas no se toca.

---

## 11. Siguientes funcionalidades

LibroYa es una **tienda propia**: vende sus libros, con un catálogo, un stock y un cobro por pedido. Para que funcione como tienda real faltan estas funcionalidades. Todas van en los contextos que ya existen y siguen los mismos patrones: **las lecturas son queries que leen directo con Prisma, y las escrituras son comandos con su handler**.

```mermaid
flowchart LR
    F10["10. Búsqueda<br/>de libros"] --> F11["11. Dirección<br/>de envío"]
    F11 --> F12["12. Admin:<br/>libros y precios"]
    F12 --> F13["13. Admin:<br/>stock"]
    F13 --> F14["14. Mis pedidos"]
    F14 -.-> F15["15. Autenticación<br/>(fase aparte)"]
```

| # | Funcionalidad | Endpoint | Contexto | Tipo |
|---|---|---|---|---|
| 10 | Listar y buscar libros | `GET /books?q=&page=&pageSize=` | Catálogo | Query |
| 11 | Dirección de envío en el pedido | `POST /orders` (campo nuevo `shippingAddress`) | Ventas | Cambio del comando |
| 12 | Crear libro, editar datos y precio, desactivar | `POST /admin/books`, `PATCH /admin/books/:isbn` | Catálogo | Comandos |
| 13 | Cargar stock | `POST /admin/stock/:isbn/additions` | Inventario | Comando |
| 14 | Historial de pedidos | `GET /orders?customerId=&cursor=` (solo con `ADMIN_API_ENABLED`, hasta tener autenticación) | Ventas | Query |

> [!warning] Los endpoints `/admin` y el historial no pueden quedar abiertos
> Mientras no haya autenticación, solo funcionan con **`ADMIN_API_ENABLED=true`** (por defecto `false`, y rechazado por el schema de Zod cuando `NODE_ENV=production`). Si está desactivado, responden **404**, como si no existieran. Así sirven en desarrollo sin quedar expuestos en un despliegue.

```ts
// platform/http/admin-api-enabled.guard.ts: @UseGuards(AdminApiEnabledGuard) en la clase de cada controller de /admin,
// y en el historial solo en su método (OrderController también tiene POST /orders, que no lleva guard)
@Injectable()
export class AdminApiEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!this.config.get<boolean>('ADMIN_API_ENABLED')) throw new NotFoundException();
    return true;
  }
}
```

Un guard es más simple que registrar controllers de forma condicional, que en Nest exige módulos dinámicos.

### Fase 10: Listar y buscar libros

```ts
// catalog/infrastructure/book/search-books.handler.ts
@QueryHandler(SearchBooksQuery)
export class SearchBooksHandler implements IQueryHandler<SearchBooksQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ q, page, pageSize }: SearchBooksQuery) {
    const where = {
      active: true,                                   // los desactivados no se muestran
      ...(q && { OR: [
        { title: { contains: q, mode: 'insensitive' as const } },
        { author: { contains: q, mode: 'insensitive' as const } },
      ] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.book.findMany({ where, orderBy: [{ title: 'asc' }, { isbn: 'asc' }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.book.count({ where }),
    ]);
    return {
      items: items.map((b) => ({ isbn: b.isbn, title: b.title, author: b.author, price: { amount: b.price.toFixed(2), currency: b.currency } })),
      page, pageSize, total,
    };
  }
}
```

- **El orden incluye el ISBN como desempate:** con títulos repetidos, ordenar solo por título puede repetir un libro en dos páginas u omitirlo.
- **`pageSize` con máximo de 50** en el DTO (`@Max(50)`), para que nadie pida el catálogo entero de una vez.
- **Cuando el catálogo crezca**, `contains` (un `ILIKE`) se vuelve lento: agrega en la migración la extensión `pg_trgm` y un índice GIN sobre `title` y `author`.

### Fase 11: Dirección de envío

Se guarda como **snapshot en el pedido**, igual que el título y el precio: si el cliente cambia su dirección después, el pedido de ayer conserva la de entrega.

```prisma
model Order {
  // …
  shipRecipient  String  @map("ship_recipient")
  shipPhone      String  @map("ship_phone")
  shipLine1      String  @map("ship_line1")
  shipDistrict   String  @map("ship_district")      // distrito
  shipProvince   String  @map("ship_province")      // provincia
  shipDepartment String  @map("ship_department")    // departamento
  shipReference  String? @map("ship_reference")     // referencia para el repartidor
}
```

- **El DTO la valida** como objeto anidado (`@ValidateNested`), con todos los campos obligatorios salvo la referencia.
- **Forma parte del hash de la `Idempotency-Key`:** un reintento con la misma clave y otra dirección responde `422 IDEMPOTENCY_KEY_REUSED`, igual que si cambiara el carrito. Cambian dos firmas:

```ts
// PlaceOrderCommand agrega la dirección
new PlaceOrderCommand(key, dto.customerId, dto.items, dto.shippingAddress, dto.cardToken);

// hashRequest la incluye, normalizada: sin espacios sobrantes y siempre en el mismo orden de campos
function hashRequest(customerId: string, items: CartItem[], address: ShippingAddress): string {
  const merged = new Map<string, number>();
  for (const i of items) merged.set(i.isbn, (merged.get(i.isbn) ?? 0) + i.quantity);
  const lines = [...merged].sort(([a], [b]) => a.localeCompare(b)).map(([isbn, q]) => `${isbn}:${q}`).join(',');
  const fields = ['recipient', 'phone', 'line1', 'district', 'province', 'department', 'reference'] as const;
  const addr = fields.map((f) => (address[f] ?? '').trim()).join('|');
  return createHash('sha256').update(`${customerId}|${lines}|${addr}`).digest('hex');
}
```
- **`OrderPlacedEvent` pasa a `eventVersion = 2`** e incluye la dirección, porque Envíos la necesitará. Los consumidores actuales ignoran el campo nuevo.

### Fase 12: Administrar libros y precios

| Comando | Qué valida |
|---|---|
| `CreateBookCommand` | ISBN válido (`Isbn.create`) y no repetido (`409 BOOK_ALREADY_EXISTS`); precio > 0 |
| `UpdateBookCommand` | El libro existe (`404`); precio > 0 si cambia |
| `DeactivateBookCommand` | Pone `active = false`. **Nunca se borra**: otros contextos lo referencian por ISBN |

- **Cambiar un precio no afecta pedidos ya hechos:** el precio quedó copiado en cada línea (snapshot).
- **El handler de `CreateBookCommand` guarda el libro y su evento en la misma transacción:** `prisma.$transaction(async (tx) => { await tx.book.create({ … }); await this.outbox.append(tx, [new BookCreatedEvent(isbn)]); })`. El evento va en `contracts/catalog/book-created.event.ts`, con `aggregateId` = ISBN. Guardados por separado, una caída entre ambos dejaría un libro sin registro de stock.
- **Al crear un libro también se crea su registro de stock en cero**, en Inventario. Se hace con un consumidor del Outbox (`inventory.create-stock-item`, tipo `db`) que reacciona a un evento nuevo, `catalog.book.created`. Así todo libro nuevo tiene su registro de stock. El caso de `STOCK_ITEM_NOT_FOUND` queda reducido a la breve ventana (alrededor de 1 s) entre que se crea el libro y el relay entrega el evento: si alguien compra justo entonces, recibe 422 y no se cobra nada, porque falla antes de reservar. En la práctica no ocurre, porque un libro recién creado tiene stock cero y no se puede vender hasta cargarle unidades (fase 13).

### Fase 13: Cargar stock

```ts
// inventory/infrastructure/stock/add-stock.handler.ts
@CommandHandler(AddStockCommand)
export class AddStockHandler implements ICommandHandler<AddStockCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ isbn, quantity }: AddStockCommand): Promise<void> {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new DomainError('INVALID_QUANTITY', 'La cantidad debe ser un entero positivo');
    // Incremento atómico: no se pisa con reservas simultáneas
    const { count } = await this.prisma.stockItem.updateMany({ where: { isbn }, data: { available: { increment: quantity } } });
    if (count === 0) throw new StockItemNotFoundError(isbn);
  }
}
```

- **Una entrada de stock es una suma, no un "fijar en N"**: con `increment`, una carga y una reserva al mismo tiempo no se pisan.
- **Toca una sola fila**, así que no rompe la regla de bloquear en orden de ISBN.

### Fase 14: Historial de pedidos

```ts
// sales/infrastructure/order/list-customer-orders.handler.ts
@QueryHandler(ListCustomerOrdersQuery)
export class ListCustomerOrdersHandler implements IQueryHandler<ListCustomerOrdersQuery> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ customerId, cursor, limit }: ListCustomerOrdersQuery) {
    const rows = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,                                      // uno de más para saber si hay otra página
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: { lines: true },
    });
    const page = rows.slice(0, limit);
    return { items: page.map(toOrderView), nextCursor: rows.length > limit ? page.at(-1)!.id : null };
  }
}
```

- **Paginación por cursor** (no por número de página): el historial solo crece, y con páginas numeradas un pedido nuevo desplazaría a los demás.
- **Agrega el índice `@@index([customerId, createdAt])`** en `Order`.
- **Hoy el `customerId` llega como parámetro**, y cualquiera que lo conozca vería los pedidos de ese cliente, con nombre, teléfono y dirección. Por eso, hasta tener autenticación, el método `list` de `OrderController` usa también `AdminApiEnabledGuard`, **en el método y no en la clase**, para que `POST /orders` siga abierto. Con la autenticación, el `customerId` saldrá del token y el endpoint pasará a `GET /me/orders`, sin el guard.

### Fase 15: Autenticación (fase aparte)

Es la funcionalidad más grande y **bloquea el despliegue público**: sin ella, cualquiera puede comprar a nombre de otro cliente o usar los endpoints de administración. Se trabaja en una fase propia: un contexto de Identidad, roles (comprador, administrador), guards de Nest y el `customerId` tomado del token. Cuando llegue, recuerda que los guards corren antes que el interceptor de correlación (sección 7).

| Fase | Listo cuando… |
|---|---|
| 10 | `GET /books?q=clean` devuelve los libros activos que coinciden, paginados |
| 11 | `POST /orders` sin dirección responde 400; con dirección, la guarda en el pedido y en `OrderPlacedEvent` v2 |
| 12 | Se crea un libro con `POST /admin/books`, aparece en la búsqueda, y su stock en cero existe en Inventario |
| 13 | `POST /admin/stock/:isbn/additions` suma unidades, y una compra posterior las reserva |
| 14 | `GET /orders?customerId=` devuelve los pedidos del cliente, del más reciente al más antiguo, con cursor |

---

## Referencias

- [NestJS 12: notas de versión de `@nestjs/core` 12.0.0](https://newreleases.io/project/npm/@nestjs/core/release/12.0.0)
- [NestJS 12: guía de migración desde v11](https://dev.to/fabwaseem/nestjs-12-migration-guide-upgrading-from-v11-tested-and-benchmarked-3nd9)
- [NestJS: SWC y Vitest](https://docs.nestjs.com/recipes/swc)
- [Prisma: estado de versiones (7 estable, 8 RC)](https://www.prisma.io/docs/orm/release-status)
- [Prisma 7: guía de migración y configuración](https://docs.prisma.io/docs/ai/prompts/prisma-7)
- [Prisma 7: multi-schema](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema)
- [Prisma: transacciones interactivas](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)