# LibroYa · tienda web

La tienda de LibroYa: catálogo, cuenta, carrito, compra y pedidos. React 19 + TanStack Router y Query + Tailwind 4 sobre Vite+ (`vp`). Habla con la API de `apps/main-api` y **nunca calcula montos**: muestra los que devuelve la API.

- Guía de la tienda: [docs/frontend/](../../docs/frontend/README.md) (decisiones, estructura, integración con la API, flujos, pruebas).
- Avance por cortes (`F0`–`F6`): [docs/frontend/00-avance.md](../../docs/frontend/00-avance.md).
- Contrato de la API que consume: [docs/api-contrato.md](../../docs/api-contrato.md).
- Convenciones del código para quien programa (y para Claude Code): [AGENTS.md](AGENTS.md).

## Puesta en marcha (desarrollo)

Requisitos: Node 24 y pnpm 12.15 (los fija `devEngines`). El backend tiene que estar en `:3000` ([su README](../main-api/README.md)).

```bash
cd apps/store-web
vp install
cp .env.example .env     # los valores por defecto sirven en local
vp dev                   # http://localhost:5173 — reenvía /api/* al backend
```

| Comando              | Para qué                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| `vp check`           | Formato, lint con tipos y tipos (Oxfmt, Oxlint, TypeScript)                        |
| `vp test`            | Pruebas de unidad y de componente (Vitest, jsdom, Testing Library, MSW)            |
| `pnpm run build`     | `tsc` y `vp build`                                                                 |
| `pnpm run test:e2e`  | Playwright contra el backend real: accesibilidad, teclado y el recorrido de compra |
| `pnpm run test:perf` | LCP, CLS e INP sobre el build de producción                                        |
| `vp run api:types`   | Regenera `src/shared/api/schema.d.ts` desde el backend levantado                   |

La compuerta previa a cada commit es `scripts/verify.sh` (desde la raíz). Cómo se prueba y por qué: [docs/frontend/06-tests.md](../../docs/frontend/06-tests.md).

## Despliegue

La tienda es **estática**: `vp build` genera la carpeta `dist/` y eso es lo único que se publica. No hay servidor de Node en producción.

```bash
pnpm install --frozen-lockfile
vp build            # → dist/ (JS, CSS y tipografías con hash en el nombre, e index.html)
vp preview          # sirve dist/ en :4173 para comprobarlo (NO es un servidor de producción)
```

### Variables de entorno

Vite solo expone las que empiezan por `VITE_`, y todas son **públicas**: van dentro del código que baja el navegador. **Nunca se pone un secreto aquí.** Se leen **al compilar** (no al arrancar): para cambiar una hay que volver a ejecutar `vp build`.

| Variable                | Por defecto             | Para qué                                                                                                                                                                                                                                  |
| ----------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`     | `/api`                  | Dónde está la API. Con el valor por defecto la tienda llama a su propio origen (`/api/...`) y un proxy inverso lo enruta al backend. Puede ser una URL absoluta si la API está en otro origen (entonces hace falta `CORS_ORIGINS`, abajo) |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | **Solo desarrollo** (`vp dev` y `vp preview`): a dónde reenvía el servidor de Vite. En producción no se usa: lo hace el proxy inverso                                                                                                     |

La plantilla es [.env.example](.env.example) y se valida al cargar la app (`src/shared/config/env.ts`): si una variable es inválida, no arranca y dice cuál.

### El mismo origen (lo recomendado)

La tienda y la API quedan en **el mismo origen**: un proxy inverso sirve `dist/` en `/` y enruta `/api/*` al backend **quitando el prefijo** (la API no lo tiene: `/api/books` llega como `/books`). Así el navegador no hace peticiones entre orígenes y no hace falta CORS. Es lo que ya hacen `vp dev` y `vp preview`.

Un ejemplo completo con **nginx**, listo para copiar y ajustar (`server_name`, certificado, ruta de `dist/` y puerto del backend), está en [deploy/nginx.conf](deploy/nginx.conf): sirve `dist/`, enruta `/api/` al backend **sin el prefijo** (la barra final del `proxy_pass` lo quita), comprime con `gzip` (o `brotli`), cachea `/assets/` un año como `immutable`, devuelve `index.html` con `no-cache` para las rutas del cliente y reenvía `X-Forwarded-For` (para `TRUST_PROXY`) y `X-Request-Id`. HTTPS lo termina el propio nginx o el balanceador que tenga delante.

Dos detalles que importan:

- **Las rutas del cliente** (`/pedidos/<id>`, `/libros/<isbn>`…) no existen como archivos: sin el `try_files … /index.html` recargar la página o abrir un enlace daría `404`.
- **`/assets/` con `try_files $uri =404`**: un trozo de JS que ya no existe (una versión anterior) debe dar `404`, no `index.html`; un navegador con la página vieja abierta lo trataría como código.

### Cabeceras de seguridad

[deploy/security-headers.conf](deploy/security-headers.conf) tiene las cabeceras que el despliegue debe añadir (se copia a `/etc/nginx/snippets/libroya-security-headers.conf` y el ejemplo la incluye en cada `location`: un `add_header` propio de un `location` descarta los del nivel superior):

| Cabecera                                           | Para qué                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`                          | La más estricta con la que la tienda funciona: scripts, estilos, tipografías y peticiones solo del propio origen (`script-src 'self'`, sin `'unsafe-inline'` ni `'unsafe-eval'`), sin `object`, sin marcos (`frame-ancestors 'none'`) y sin cambiar `base` ni el destino de los formularios |
| `X-Content-Type-Options: nosniff`                  | El navegador no adivina el tipo de un archivo                                                                                                                                                                                                                                               |
| `Referrer-Policy: strict-origin-when-cross-origin` | Las URL de la tienda no salen enteras hacia otro sitio                                                                                                                                                                                                                                      |
| `Permissions-Policy`                               | Sin cámara, micrófono ni geolocalización                                                                                                                                                                                                                                                    |
| `Strict-Transport-Security`                        | Solo HTTPS (si TLS lo termina un balanceador, ponerla allí)                                                                                                                                                                                                                                 |

La política **está probada**: `test/e2e/security.e2e.ts` la lee de ese mismo archivo, la aplica al build de producción y recorre registro, compra, confirmación y pedidos fallando ante cualquier violación (`E2E_PRODUCTION_BUILD=1`, ver [06-tests](../../docs/frontend/06-tests.md)). Si se añade algo que necesite otra fuente (la pasarela de pago, una analítica), se amplía ahí con el origen exacto y se vuelve a ejecutar. Para eso, `zod` se configura sin compilación en tiempo de ejecución (`src/shared/lib/zod.ts`): sin ello el navegador reportaría una violación de `'unsafe-eval'`.

### Si la API está en otro origen

Compila con `VITE_API_BASE_URL=https://api.example.com` y configura el backend con `CORS_ORIGINS=https://tienda.example.com` (los orígenes exactos, separados por comas, sin comodines y **solo `https`**: en producción el backend rechaza otros). Es más frágil que el mismo origen (cada petición con cabecera `Authorization` o `Idempotency-Key` hace una petición previa `OPTIONS`) y se aplica el límite de intentos igual.

### Qué configurar en el backend

| Variable              | Qué hace falta                                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV=production` | Activa las comprobaciones de arranque de abajo: el backend no inicia si alguna falla                                                                                        |
| `JWT_SECRET`          | **Obligatoria**: `openssl rand -base64 48`. Firma los tokens de acceso                                                                                                      |
| `TRUST_PROXY`         | El número de proxies delante de la API (1 con el nginx de arriba). Con `0` el límite de intentos de `/auth/*` contaría la dirección del proxy y bloquearía a todos a la vez |
| `CORS_ORIGINS`        | Solo si la API **no** está en el mismo origen (arriba)                                                                                                                      |
| `PAYMENT_PROVIDER`    | `external` con `PAYMENT_API_URL`: `fake` aprueba cualquier tarjeta y el backend no arranca con él en producción                                                             |
| `PASSWORD_HASH_LOG_N` | Al menos 15 en producción                                                                                                                                                   |

Las demás (`DB_*`, retención, límites…) están en el [README del backend](../main-api/README.md).

### Lo que falta para cobrar de verdad

La tienda envía a `POST /orders` un `cardToken`. Hoy es **una tarjeta de prueba** de la pasarela simulada (`tok_visa`, `tok_declined`, `tok_error`, [DP-06](../../docs/product/09-decisiones-y-preguntas.md)): el selector «Tarjeta de prueba» solo se dibuja fuera de producción (`import.meta.env.PROD`) y en producción se envía la aprobada. Como el backend **no permite la pasarela simulada en producción**, la compra real necesita, antes de abrir la tienda al público:

1. Elegir el proveedor de pagos.
2. Un componente de pago de ese proveedor que produzca el `cardToken` (el número de tarjeta nunca debe pasar por LibroYa, RN-24).
3. Retirar el envío de `tok_visa` por defecto.

Está anotado como problema abierto 11 en el [control de avance](../../docs/frontend/00-avance.md#problemas-abiertos).

### Lista de comprobación antes de publicar

- [ ] `pnpm run build` y `pnpm run test:e2e` en verde, y `pnpm run test:perf` si hubo cambios de peso.
- [ ] Un proxy inverso con [deploy/nginx.conf](deploy/nginx.conf): `/api` al backend sin prefijo, `index.html` para las rutas del cliente, compresión, caché y las cabeceras de seguridad.
- [ ] El backend con `NODE_ENV=production`, `JWT_SECRET`, `TRUST_PROXY` y una pasarela real.
- [ ] HTTPS en todo; el backend solo acepta orígenes `https` en `CORS_ORIGINS`.
- [ ] Probar en el navegador, contra ese despliegue: registrarse, comprar, recargar `/pedidos/<id>` (debe seguir ahí) y cerrar sesión.
