# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Estructura del repositorio

Monorepo `books-now-marketplace` (LibroYa, una librería online). La carpeta local se llama `books-frontend`, pero casi todo el código es del backend. La documentación y los comentarios del código están en español; mantén ese idioma.

- `apps/main-api`: API con NestJS 12 + Prisma 7 + PostgreSQL 18 (ESM, TypeScript 6, Vitest 4). Aquí está casi todo el trabajo. Su `README.md` explica la puesta en marcha, las variables de entorno y los problemas frecuentes.
- `apps/store-web`: andamiaje de Vite+ (CLI `vp`) que por ahora solo tiene el código de ejemplo del contador. Los comandos `vp` (`vp dev`, `vp check`, `vp test`) están en su `AGENTS.md`. La guía del frontend está en `docs/frontend/` (avance por cortes `F0`–`F6` en `00-avance.md`): el stack decidido es React 19 + TanStack Router/Query + openapi-fetch + Zustand + Tailwind 4/shadcn, pero **aún no está instalado**: el código sigue siendo la plantilla.
- `docs/`: guía de diseño, contrato de la API (`api-contrato.md`, lo que consume el frontend) y `docs/product/`, la fuente de información del producto (visión, reglas de negocio `RN-nn`, historias `HU-nn`, pantallas `PA-nn`, decisiones abiertas `DP-nn`); si algo ahí contradice a la API real, gana la API. `docs/backend/00-avance.md` es el control de avance.

No hay `package.json` en la raíz; cada app tiene su propio `pnpm-lock.yaml`. Ejecuta los comandos desde la carpeta de la app.

## Comandos (`apps/main-api`; pnpm 12.15, Node >= 24.15)

```bash
cp .env.example .env               # la primera vez; DB_PORT=5433 coincide con docker-compose
pnpm install
pnpm run db:up                     # PostgreSQL 18 con Docker (tiene que ser la 18: el Outbox usa uuidv7())
pnpm exec prisma migrate dev       # migra y genera el cliente de Prisma
pnpm run db:seed                   # datos de ejemplo (opcional)
pnpm run start:dev                 # API en :3000, Swagger en /docs

pnpm lint                          # oxlint --type-aware (src, test, prisma)
pnpm run format:check              # comprueba Prettier (pnpm format reescribe los archivos)
pnpm run build
pnpm test                          # solo unitarios, sin base de datos
pnpm run test:e2e                  # integración + e2e; levanta su propio postgres:18 con Testcontainers, requiere Docker
pnpm exec vitest run test/unit/env.schema.spec.ts     # un archivo unitario
pnpm exec vitest run -t "texto del test"              # un test por nombre
pnpm exec vitest run --config ./vitest.config.e2e.ts test/e2e/auth.e2e.spec.ts   # un archivo e2e
```

El CI (`.github/workflows/main-api.yml`) ejecuta lint, format:check, build, test y test:e2e, además de `pnpm audit --prod`. Antes de subir cambios corre la misma cadena: `pnpm lint && pnpm run format:check && pnpm run build && pnpm test && pnpm run test:e2e`.

El cliente de Prisma se genera en `src/platform/prisma/generated/` (no se sube a git); `build`, `test` y `test:e2e` lo regeneran. Si aparece `Cannot find module './generated/client.js'`, ejecuta `pnpm run prisma:generate`.

## Arquitectura (`apps/main-api/src`)

Monolito modular con DDD + CQRS (`@nestjs/cqrs`) + arquitectura hexagonal. Los bounded contexts viven en `contexts/` (`sales`, `catalog`, `inventory`, `identity`) y cada uno se divide en `domain/`, `application/` e `infrastructure/` (más `<contexto>.module.ts`). Lo transversal está en `platform/` (config, prisma, outbox, observability, http, health, auth) y en `shared-kernel/`.

**Reglas de dependencias**: las comprueba `test/unit/dependency-rules.spec.ts` (helpers en `test/support/architecture.ts`; una librería nueva permitida en `domain/` o `contracts/` hay que autorizarla ahí).
- Un contexto nunca importa de otro contexto. Se hablan solo mediante `contracts/` (el "Published Language": comandos, queries y eventos) y `shared-kernel/`.
- `domain/` solo importa `decimal.js` y `node:*` (nada de Nest, Prisma ni platform).
- `application/` puede usar Nest pero no Prisma; el código que necesita la transacción (`tx`) va en `infrastructure/`.
- `contracts/` solo puede usar `@nestjs/cqrs`; `shared-kernel/` no depende de nada del proyecto.
- Las llamadas directas van en un solo sentido: Ventas llama a Catálogo e Inventario (mediante puertos y adaptadores en proceso); nadie llama a Ventas.
- Los imports llevan extensión `.js` (ESM con nodenext).

**Base de datos**: una sola BD con un schema por contexto (`sales`, `catalog`, `inventory`, `identity`) más `messaging` para el outbox. No hay joins, claves foráneas ni transacciones entre schemas de contextos. El dinero es `Decimal` exacto en BD y dominio (`Money` con decimal.js) y, en la API, `{ amount: "90.00", currency: "PEN" }` (texto con 2 decimales).

**Flujo de compra (`POST /orders`)**: sincrónico: precio (Catálogo) → reservar stock (Inventario) → cobrar (puerto de pasarela de pago) → guardar el pedido + evento `OrderPlaced`, con compensación inmediata si algo falla. Exige el header `Idempotency-Key`; un registro de checkout persistido y un job de recuperación (`recover-checkouts.job.ts`) reembolsan y liberan lo que quedó a medias tras una caída. Solo las reacciones posteriores a la compra (email de confirmación, confirmar la reserva de stock, crear el cliente al registrarse) son eventos.

**Outbox** (`platform/outbox`): los eventos se guardan en la misma transacción que el cambio (`OutboxWriter.append(tx, ...)`); `OutboxRelay` consulta cada segundo y entrega a los consumidores marcados con `@OutboxHandler()` (se descubren solos; basta listarlos en `providers` del módulo). El consumidor `db` recibe `ctx.tx` y tiene efecto único; el `external` es al-menos-una-vez y debe enviar `ctx.eventId` como clave de idempotencia. Un consumidor solo recibe los eventos guardados después de desplegarlo. `GET /health/outbox` es para monitoreo, nunca para el balanceador (para eso están `/health/live` y `/health/ready`).

**Autenticación** (`platform/auth`; la implementa `identity`): un `AuthGuard` global con denegado por defecto: toda ruta exige un token de acceso válido salvo las marcadas `@Public()`; `@Roles(...)` añade la comprobación de rol y `@CurrentUser()` lee el usuario. El guard depende del puerto `AccessTokenVerifier`, no de Identidad. Los tokens de acceso son JWT (`jose`), los de refresco rotan con detección de reutilización y las contraseñas usan scrypt. Registrar un comprador emite `identity.user.registered`, que Ventas consume para crear su Customer. La autenticación (corte 7) sigue en curso: `ADMIN_API_ENABLED` todavía existe como interruptor solo de desarrollo para las rutas `/admin/*` (cerrado → `404`; no se permite con `NODE_ENV=production`) y está previsto eliminarlo.

**Configuración**: las variables de entorno se validan con Zod al arrancar (`platform/config/env.schema.ts`) y la app no inicia si alguna es inválida (por ejemplo `PAYMENT_PROVIDER=fake` o `PASSWORD_HASH_LOG_N<15` en producción). La URL de la BD se arma con las variables `DB_*` separadas en un solo lugar (`platform/config/database-url.ts`), que usan la app y `prisma.config.ts`.

**Peticiones**: cada una lleva un `X-Request-Id` (middleware + `RequestContext`) que aparece en todos los logs, en el registro del checkout y en los eventos del outbox.

## Pruebas

- Los tests viven en `test/`, no junto al código: `unit/` (sin BD), `integration/` y `e2e/` (PostgreSQL real con Testcontainers; el `global-setup` de `test/support/global-setup.ts` aplica las migraciones).
- Los archivos de integración y e2e se ejecutan uno tras otro (comparten un contenedor). Cada archivo llama antes a `resetDatabase()` (`test/support/database.ts`), que solo funciona sobre ese contenedor.
- `test/fakes/` tiene repositorios en memoria y puertos falsos (pago, notificador, stock, catálogo) para los unitarios; `test/support/` tiene builders, utilidades de autenticación y la fábrica de la app HTTP.

## Convenciones de trabajo

- El trabajo se organiza en "cortes" en `docs/backend/00-avance.md`. Los commits se numeran por tarea (por ejemplo `7.6: Add the default-deny auth guard…`). Al avanzar una tarea, marca su casilla, anota lo que cambió respecto a la guía y deja una línea en la bitácora de ese archivo; mantén sincronizados los documentos de la guía (`docs/backend/*`, `docs/api-contrato.md`) con lo que realmente se construyó.
- Las ramas siguen el patrón `feature/*` y los PR van contra `main`; el pull request lo abre el usuario (los cortes 6 y 7 del backend pasaron por `feature/backend-mvp`).
- Un corte está terminado cuando sus tareas están marcadas, `pnpm lint` y `pnpm test` pasan, y sus criterios de "listo cuando…" se cumplen ejecutándolos de verdad.
