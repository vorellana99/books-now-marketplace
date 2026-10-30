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

Un ejemplo con **nginx** (HTTPS lo termina el propio nginx o el balanceador que tenga delante):

```nginx
server {
  listen 443 ssl http2;
  server_name tienda.example.com;
  root /var/www/libroya/dist;

  # Comprimir: `vp preview` no comprime, el JS inicial pesa ~650 kB sin comprimir y ~195 kB con gzip
  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;
  # brotli on;   # si el módulo está instalado (mejor que gzip)

  # La API, en el mismo origen: se quita el prefijo /api (la barra final del proxy_pass lo hace)
  location /api/ {
    proxy_pass http://127.0.0.1:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # el límite de intentos cuenta por dirección: ver TRUST_PROXY
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Request-Id $request_id;                     # sale en los logs del backend (código de soporte)
  }

  # Archivos con hash en el nombre: nunca cambian, se cachean un año
  location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }

  # Todo lo demás es una ruta del cliente (/carrito, /pedidos/…): devuelve index.html, que no se cachea para que una
  # versión nueva llegue en la siguiente visita
  location / {
    add_header Cache-Control "no-cache";
    try_files $uri /index.html;
  }
}
```

Dos detalles que importan:

- **Las rutas del cliente** (`/pedidos/<id>`, `/libros/<isbn>`…) no existen como archivos: sin el `try_files … /index.html` recargar la página o abrir un enlace daría `404`.
- **`/assets/` con `try_files $uri =404`**: un trozo de JS que ya no existe (una versión anterior) debe dar `404`, no `index.html`; un navegador con la página vieja abierta lo trataría como código.

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
- [ ] Un proxy inverso con el ejemplo de arriba: `/api` al backend sin prefijo, `index.html` para las rutas del cliente, compresión y caché.
- [ ] El backend con `NODE_ENV=production`, `JWT_SECRET`, `TRUST_PROXY` y una pasarela real.
- [ ] HTTPS en todo; el backend solo acepta orígenes `https` en `CORS_ORIGINS`.
- [ ] Probar en el navegador, contra ese despliegue: registrarse, comprar, recargar `/pedidos/<id>` (debe seguir ahí) y cerrar sesión.
