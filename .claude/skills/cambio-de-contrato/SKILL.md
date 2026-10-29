---
name: cambio-de-contrato
description: Propagar un cambio de la API del backend a la tienda web (regenerar schema.d.ts, ajustar los alias, comprobar el frontend y actualizar los documentos). Úsalo siempre que cambie una ruta, un cuerpo, una respuesta o un código de error que la tienda consume.
---

# Un cambio de contrato que llega a la tienda

El contrato es el OpenAPI que publica el backend; la tienda lo convierte en tipos con `openapi-typescript`. **El frontend nunca importa de `schema.d.ts` directamente:** solo de `apps/store-web/src/shared/api/types.ts`.

1. **Primero el backend** (con `/tarea`): código, pruebas y compuerta en verde, y `docs/api-contrato.md` al día.
2. **Levantar el backend real** con una base temporal (no la de desarrollo del usuario):
   - `docker run -d --name libroya-tmp -e POSTGRES_USER=libroya -e POSTGRES_PASSWORD=libroya -e POSTGRES_DB=libroya -p 55433:5432 postgres:18`
   - en `apps/main-api`, con `DB_HOST=127.0.0.1 DB_PORT=55433 DB_USER=libroya DB_PASSWORD=libroya DB_NAME=libroya`: `pnpm exec prisma migrate deploy`, `pnpm run build` y `node dist/main.js` en segundo plano.
3. **Regenerar:** en `apps/store-web`, `pnpm run api:types` (lee `http://localhost:3000/docs-json`). El archivo se sube a git y está excluido del lint y el formato.
4. **Apagar** lo temporal: mata el servidor por **PID** (nunca `pkill -f`) y `docker rm -f libroya-tmp`.
5. **Ajustar** `shared/api/types.ts` si cambió el nombre de un esquema (ocurrió con `OrderResponse` → `OrderDetailResponse`), y el código que deje de compilar.
6. **Comprobar:** `pnpm exec vp check` y `pnpm exec vp test` (o `scripts/verify.sh frontend`). Revisa que los handlers de MSW siguen la forma real de cada respuesta.
7. **Documentos:** `docs/frontend/03-integracion-con-la-api.md` (qué endpoint usa cada pantalla y su estado), el avance de frontend si cambia el estado de una tarea, y producto (`docs/product/04` historias, `09` decisiones) si cambia lo que la persona ve. Si el cambio contradice una decisión de producto (`DP-nn`), **pregunta al usuario** antes.
