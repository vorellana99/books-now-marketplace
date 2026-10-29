---
name: nueva-variable-entorno
description: Lista de comprobación para añadir o cambiar una variable de entorno del backend (esquema Zod, reglas de producción, pruebas, ejemplo y documentación). Úsalo al introducir cualquier configuración nueva.
---

# Una variable de entorno nueva

1. **Esquema:** `apps/main-api/src/platform/config/env.schema.ts` (Zod). Todo llega como texto: usa `z.coerce` para números y acota (`min`, `max`, `int`). Pon un valor por defecto **seguro** (cerrado, sin CORS, el costo alto).
2. **Reglas de producción:** si un valor inseguro nunca debe llegar a producción, añade un `.refine` sobre `NODE_ENV === 'production'` con el nombre de la variable en `path` (ejemplos: `PAYMENT_PROVIDER=fake`, `JWT_SECRET` obligatorio, `PASSWORD_HASH_LOG_N ≥ 15`, `CORS_ORIGINS` solo https). La app **no arranca** con un valor inválido.
3. **Se lee** con `ConfigService.getOrThrow<tipo>('NOMBRE')`, no con `process.env` (solo `main.ts` mira `NODE_ENV`).
4. **Pruebas** en `test/unit/env.schema.spec.ts`: el valor por defecto, cada límite en el borde (el mínimo, el máximo y uno fuera), los valores no válidos, y la regla de producción con un `production` válido (con `JWT_SECRET` y lo demás).
5. **Los tests del resto del backend:** si el valor por defecto estorba (un límite de intentos), fíjalo en `test/support/global-setup.ts`; una prueba que necesite otro valor construye su app con `createHttpApp(módulos, { VARIABLE: 'valor' })` (`AppModule` valida el entorno una sola vez, al importarse).
6. **Documentos:** `apps/main-api/.env.example` (con comentario), la tabla de variables de `apps/main-api/README.md`, el bloque de ejemplo y el esquema de `docs/backend/02-estructura-y-puesta-en-marcha.md`, y una fila en «Decisiones y desvíos».
7. Si es de seguridad: mutaciones sobre sus límites y la regla de producción (`/mutar`).
