---
name: nueva-ruta
description: Lista de comprobación para añadir un endpoint HTTP al backend (controlador, acceso, DTO, errores, Swagger, pruebas, contrato). Úsalo al implementar cualquier ruta nueva o al cambiar el acceso o la forma de una existente.
---

# Una ruta nueva en el backend

Parte de `/tarea`. Orden sugerido (las pruebas primero):

1. **Quién puede llamarla.** Por defecto **toda ruta exige sesión** (guard global). Decide y anota: `@Public()` (catálogo, salud, `/auth/*`), `@Roles('BUYER')`, `@Roles('ADMIN')` (`@AdminApi()` en los controladores de `/admin`), o cualquiera con sesión. Si hay un dueño (un pedido, un recurso de una persona), **filtra por el dueño dentro de la consulta** y da el mismo `404` que un recurso inexistente (no `403`).
2. **Registrar el acceso en la tabla** `EXPECTED` de `test/e2e/route-access.e2e.spec.ts`. Si falta, ese test falla a propósito: es la lista de rutas y su acceso. Comprueba también que Swagger coincide (lo hace ese test).
3. **DTO** (`class-validator`): la validación global rechaza campos de más (`forbidNonWhitelisted`), así que un campo que no debe venir (`customerId`, `role`, precios) ya da `400`. Acota tamaños (`@MaxLength`, listas con máximo). El cliente nunca manda precios ni totales.
4. **Lógica en un comando o consulta** (`CommandBus`/`QueryBus`), no en el controlador. Errores con `DomainError` y sus subclases (→ `422`, `NotFoundError` → `404`, `ConflictError` → `409`, `AuthenticationError` → `401`, `AuthorizationError` → `403`, `TooManyRequestsError` → `429`). El mensaje no repite datos sensibles.
5. **El usuario** se lee con `@CurrentUser()` + `requireUser(user)` (falla cerrado si el guard no lo puso). Nunca del cuerpo.
6. **Si es sensible al abuso** (acepta credenciales, crea cuentas, es caro): añade su límite en `authThrottlers` (`src/contexts/identity/infrastructure/auth-throttler.ts`) y sus variables `RATE_LIMIT_*` (ver `/nueva-variable-entorno`).
7. **Swagger:** `@ApiOperation`, las respuestas y los `errorCode` en sus descripciones. Los `401`/`403` se añaden solos según el acceso real.
8. **Pruebas:** unitaria del controlador (buses simulados; el guard se simula con un guard falso) y e2e con la aplicación real y **tokens reales** (`bearer(app, 'BUYER')`, `signUp`, `loginAs` en `test/support/auth.ts`): sin token `401`, con otro rol `403`, un recurso ajeno `404`, el cuerpo inválido `400`, y que nada sensible sale en logs ni respuestas.
9. **Documentos:** fila en `docs/api-contrato.md` (método, ruta, respuesta, errores), el README si es algo que se prueba con `curl`, y la bitácora. Si la tienda web la usará: `/cambio-de-contrato`.
10. Es crítico en seguridad: **mutaciones** (`/mutar`) sobre el control de acceso y el filtro por dueño.
