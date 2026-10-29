# LibroYa API: guía de implementación en NestJS

API REST de LibroYa construida con DDD, CQRS y arquitectura hexagonal. Los conceptos y el código del dominio son los de la guía DDD v5. Esta guía solo cubre lo necesario para construir el backend. Este archivo es el índice: el contenido está repartido en los documentos de abajo. El producto se explica en [la carpeta de producto](product/README.md), para cualquier lector; el resto de la guía es técnica.

> [!caution] Estado de esta guía
> El diseño está revisado, pero **el código se está ejecutando por cortes** (ver el estado más abajo). Hasta ahora está validada la base: migración, configuración, observabilidad y health contra PostgreSQL 18 real. La validación pendiente son los tests de integración y e2e del resto (ver [backend/06-tests.md](backend/06-tests.md)). Hasta que pasen, considérala una base para implementar, no una implementación lista para producción.

## Estado en este repositorio

El backend vive en **`apps/main-api/`** (monorepo `books-now-marketplace`). En la guía, `libroya-api/` equivale a esa carpeta, y todos los comandos se ejecutan desde ella. El detalle de lo hecho y lo pendiente está en [backend/00-avance.md](backend/00-avance.md).

| Corte | Estado |
|---|---|
| 0. Scaffold (Nest 12, ESM, Vitest, oxlint, Prettier) | ✅ |
| 1. Fundaciones: Docker con PostgreSQL 18, schema y migración de Prisma, config, observabilidad, health y Swagger | ✅ |
| 2. Dominio de Ventas | ⬜ |
| 3. Catálogo e Inventario | ⬜ |
| 4. Outbox | ⬜ |
| 5. Compra completa | ⬜ |

Donde la documentación diga `npm`/`npx`, en este repositorio se usa **`pnpm`** (`pnpm add`, `pnpm exec`, `pnpm run`).

---

## Índice

La guía se divide por audiencia: lo que comparten backend y frontend vive en `docs/`, y lo propio del backend en `docs/backend/`.

| Documento | Contenido | Quién lo lee |
|---|---|---|
| [product/](product/README.md) | **Fuente de información del producto**: visión y alcance, actores, glosario, reglas del negocio, historias de usuario, recorridos, pantallas, textos y decisiones abiertas | Todos |
| [api-contrato.md](api-contrato.md) | Endpoints, respuestas, errores y formato de montos | Backend y frontend |
| [backend/00-avance.md](backend/00-avance.md) | **Control de avance** de la implementación, por cortes, con tareas, desvíos de la guía y bitácora | Backend |
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
