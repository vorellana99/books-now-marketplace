# LibroYa API: guía de implementación en NestJS

API REST de LibroYa construida con DDD, CQRS y arquitectura hexagonal. Los conceptos y el código del dominio son los de la guía DDD v5. Esta guía solo cubre lo necesario para construir el backend. Este archivo es el índice: el contenido está repartido en los documentos de abajo. El producto se explica en [producto.md](producto.md), para cualquier lector; el resto de la guía es técnica.

> [!caution] Estado de esta guía
> El diseño está revisado, pero **el código no se ha ejecutado**. La validación pendiente son los tests de integración y e2e contra PostgreSQL 18 real (ver [backend/06-tests.md](backend/06-tests.md)). Hasta que pasen, considérala una base para implementar, no una implementación lista para producción.

## Estado en este repositorio

El backend vive en **`apps/main-api/`** (monorepo `books-now-marketplace`). En la guía, `libroya-api/` equivale a esa carpeta, y todos los comandos se ejecutan desde ella. Hoy solo existe el esqueleto que genera el CLI de Nest 12; **de la lógica de LibroYa no hay nada implementado todavía**.

| Ya está hecho (no repetir) | Falta (lo que cubre esta guía) |
|---|---|
| ✅ Proyecto Nest 12 en ESM (`"type": "module"`, imports relativos con `.js`) | Dependencias de [la puesta en marcha](backend/02-estructura-y-puesta-en-marcha.md): CQRS, config, Swagger, schedule, terminus, class-validator, Prisma 7, decimal.js, Testcontainers |
| ✅ TypeScript 6, Vitest 4 y Vite 8 configurados (`vitest.config.ts`, `vitest.config.e2e.ts`) | Ajustar los `include` de Vitest a la estructura `test/unit` y `test/{integration,e2e}` (ver [backend/06-tests.md](backend/06-tests.md)) |
| ✅ Lint con oxlint (`--type-aware`) y formato con Prettier (comillas simples, coma final) | Scripts `db:*`, `prisma:generate`, `prebuild` y `pretest` |
| ✅ `supertest` y `@types/supertest` instalados | `docker-compose.yml` con PostgreSQL 18, `.env`, `prisma/` y `prisma.config.ts` |
| ✅ `.gitignore` con `.env` y `/dist` | Agregar `src/platform/prisma/generated/` al `.gitignore` |
| ✅ Gestor de paquetes: **pnpm** (`pnpm-lock.yaml`) | Todo `src/`: `platform/`, `shared-kernel/`, `contracts/` y `contexts/` |
| ✅ `src/main.ts` y `src/app.module.ts` mínimos | Reemplazar `main.ts` y `app.module.ts` por los de [piezas clave](backend/05-piezas-clave.md) |
| ⚠️ `AppController`, `AppService` y `test/app.e2e-spec.ts` (el "Hello World" del scaffold) | Eliminarlos al tener `HealthController` y los primeros endpoints reales |

Donde la documentación diga `npm`/`npx`, en este repositorio se usa **`pnpm`** (`pnpm add`, `pnpm exec`, `pnpm run`).

---

## Índice

La guía se divide por audiencia: lo que comparten backend y frontend vive en `docs/`, y lo propio del backend en `docs/backend/`.

| Documento | Contenido | Quién lo lee |
|---|---|---|
| [producto.md](producto.md) | Qué es LibroYa, actores, recorrido de compra, reglas del negocio y glosario | Todos |
| [api-contrato.md](api-contrato.md) | Endpoints, respuestas, errores y formato de montos | Backend y frontend |
| [backend/01-decisiones-y-stack.md](backend/01-decisiones-y-stack.md) | Decisiones, stack y versiones · arquitectura, módulos y reglas de dependencia | Backend |
| [backend/02-estructura-y-puesta-en-marcha.md](backend/02-estructura-y-puesta-en-marcha.md) | Estructura de carpetas · instalación, scripts, Docker y `.env` | Backend |
| [backend/03-base-de-datos.md](backend/03-base-de-datos.md) | Esquema con Prisma 7, montos, relaciones y transacciones | Backend |
| [backend/04-flujo-pedido-y-saga.md](backend/04-flujo-pedido-y-saga.md) | Flujo de un pedido, saga mínima, handler con compensaciones y job de recuperación | Backend |
| [backend/05-piezas-clave.md](backend/05-piezas-clave.md) | `Money`, puertos y eventos, Inventario, Outbox, correlación, HTTP y arranque | Backend |
| [backend/06-tests.md](backend/06-tests.md) | Estrategia de tests con Vitest y casos mínimos | Backend |
| [backend/07-fases-y-roadmap.md](backend/07-fases-y-roadmap.md) | Orden de implementación (fases 0–9) y siguientes funcionalidades (10–15) | Backend |
| [frontend/README.md](frontend/README.md) | Guía del frontend (`apps/store-web`), pendiente | Frontend |

> [!note] Numeración
> Los títulos conservan los números de sección de la guía original (0 a 11), por si algún comentario o conversación antigua los menciona.

---

## Referencias

- [NestJS 12: notas de versión de `@nestjs/core` 12.0.0](https://newreleases.io/project/npm/@nestjs/core/release/12.0.0)
- [NestJS 12: guía de migración desde v11](https://dev.to/fabwaseem/nestjs-12-migration-guide-upgrading-from-v11-tested-and-benchmarked-3nd9)
- [NestJS: SWC y Vitest](https://docs.nestjs.com/recipes/swc)
- [Prisma: estado de versiones (7 estable, 8 RC)](https://www.prisma.io/docs/orm/release-status)
- [Prisma 7: guía de migración y configuración](https://docs.prisma.io/docs/ai/prompts/prisma-7)
- [Prisma 7: multi-schema](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/multi-schema)
- [Prisma: transacciones interactivas](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)
