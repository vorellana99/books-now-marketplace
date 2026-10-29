# Frontend: estructura y puesta en marcha

## 1. Estructura de carpetas

Los archivos marcados **(F n)** los crea el corte `F n` de [00-avance](00-avance.md). Los que no llevan marca ya existen en la plantilla.

```text
apps/store-web/
├── package.json                    scripts y dependencias                 (F0 las amplía)
├── vite.config.ts                  Vite+: lint, formato, plugins, proxy   (F0 lo amplía)
├── tsconfig.json                   existe; (F0) añade `jsx` y el alias `@/*`
├── pnpm-workspace.yaml             catálogo de Vite+ (ya existe)
├── index.html                      (F0) `lang="es"` y el título
├── src/styles.css                  (F0) tokens de diseño (`@theme`) y tipografías autoalojadas
├── components.json                 (F0) configuración de shadcn/ui
├── .env.example                    (F0) variables de entorno
├── public/
├── src/
│   ├── main.tsx                    (F0) arranque: React, router, Query    ← reemplaza a main.ts
│   ├── routeTree.gen.ts            generado por el plugin del router; se sube a git
│   ├── routes/                     (F0) archivos de ruta, delgados
│   │   ├── __root.tsx              layout: cabecera, avisos, errores
│   │   ├── index.tsx               PA-01 catálogo
│   │   ├── libros.$isbn.tsx        PA-02 detalle
│   │   ├── registro.tsx            PA-03
│   │   ├── ingresar.tsx            PA-04
│   │   ├── carrito.tsx             PA-05            (con sesión)
│   │   ├── compra.tsx              PA-06            (con sesión)
│   │   ├── pedidos.index.tsx       PA-08            (con sesión)
│   │   ├── pedidos.$id.index.tsx   PA-09            (con sesión)
│   │   └── pedidos.$id.gracias.tsx PA-07            (con sesión)
│   ├── features/
│   │   ├── catalog/                buscar y ver libros           (F1)
│   │   ├── auth/                   registro, login, sesión       (F2)
│   │   ├── cart/                   carrito persistido            (F3)
│   │   ├── checkout/               dirección, pago, idempotencia (F4)
│   │   └── orders/                 mis pedidos y su detalle      (F5)
│   │       └── <cada una>/  index.ts · pages/ · components/ · hooks/ · api.ts
│   └── shared/
│       ├── api/                    cliente, esquema generado, errores     (F0)
│       │   ├── schema.d.ts         generado por `api:types`; se sube a git
│       │   ├── types.ts            reexporta los tipos de la API: lo único que importan las funcionalidades
│       │   ├── client.ts
│       │   ├── errors.ts           `ApiError` y `toApiError`
│       │   └── error-messages.ts   `errorCode` → texto (de producto 07)
│       ├── ui/                     componentes de shadcn/ui y propios    (F0)
│       ├── lib/                    formato de montos y fechas, utilidades (F0)
│       └── config/                 variables de entorno validadas        (F0)
└── test/
    ├── unit/                       lógica pura, sin DOM
    ├── component/                  Testing Library + MSW
    ├── e2e/                        Playwright                            (F6)
    └── support/                    handlers de MSW, render con providers, fábricas
```

**Las pruebas viven en `test/`**, no junto al código, igual que en el backend ([06-tests](06-tests.md)).

**Una funcionalidad por dentro:** `index.ts` exporta lo único que otras funcionalidades pueden usar; `pages/` tiene las pantallas que montan las rutas; `hooks/` envuelve TanStack Query; `api.ts` llama al cliente y no se exporta fuera.

## 2. Puesta en marcha

Requisitos: Node 24 y pnpm 12.15 (los fija `devEngines`; pnpm descarga el correcto). El backend en `apps/main-api` debe estar corriendo en `:3000` para ver datos reales ([su README](../../apps/main-api/README.md)).

```bash
cd apps/store-web
vp install                  # o: pnpm install
cp .env.example .env        # (F0)
vp dev                      # http://localhost:5173
```

| Comando | Para qué |
|---|---|
| `vp dev` | Servidor de desarrollo con recarga |
| `vp check` | Formato, lint con tipos y comprobación de tipos, todo junto |
| `vp test` | Pruebas con Vitest (`--watch` mientras se desarrolla) |
| `vp build` | Compilación de producción (`pnpm run build` hace antes `tsc`) |
| `vp preview` | Sirve la compilación para probarla |
| `vp run api:types` | Regenera `src/shared/api/schema.d.ts` desde el backend (F0) |

Antes de subir cambios: `vp check && vp test && vp build`. Esa misma cadena debe correr en el CI ([00-avance](00-avance.md), F0).

`vp` es un comando global de Vite+, y `vp <nombre>` ejecuta uno propio de la herramienta mientras que `vp run <nombre>` ejecuta un script de `package.json`. Los detalles están en `apps/store-web/AGENTS.md`.

## 3. Variables de entorno

Se leen de `.env` (no se sube; la plantilla es `.env.example`). Vite solo expone las que empiezan por `VITE_`, y todas son **públicas**: nunca van secretos aquí.

| Variable | Por defecto | Para qué |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Dónde está la API. Con el valor por defecto, en desarrollo el servidor de Vite reenvía `/api` al backend (ver abajo) |
| `VITE_API_PROXY_TARGET` | `http://localhost:3000` | Solo desarrollo: a dónde reenvía el proxy |
| `VITE_API_DOCS_URL` | `http://localhost:3000/docs-json` | Solo para `api:types`: de dónde se lee el contrato |

Se validan una sola vez en `shared/config/` (con Zod), y la app no arranca si falta una obligatoria.

### Proxy de desarrollo

La API todavía no tiene CORS (tarea `7.10` del backend). Mientras tanto, el navegador llama a su propio origen y Vite reenvía:

```ts
// vite.config.ts (fragmento)
server: {
  proxy: {
    '/api': {
      target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
      rewrite: (path) => path.replace(/^\/api/, ''),   // la API no tiene prefijo
    },
  },
},
```

En producción el frontend y la API quedan en el **mismo origen** detrás de un proxy inverso que enruta `/api` al backend; si no fuera así, se necesita `CORS_ORIGINS` en el backend (`7.10`). Ver [00-avance](00-avance.md), F6.

## 4. Usuarios de prueba

El seed del backend crea compradores de ejemplo (Ana y Luis) con una contraseña de desarrollo que documenta el README del backend (tarea `7.11`). No se copian aquí: se consultan allí. Hasta esa tarea, se registra una cuenta con el formulario de PA-03 o con `POST /auth/register`.
