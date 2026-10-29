# Frontend: decisiones, stack y arquitectura

## 1. Decisiones

| Tema | Decisión |
|---|---|
| Tipo de app | **SPA** servida como archivos estáticos. Sin SSR: el SEO no es prioridad del MVP (DP-08) |
| Base | **Vite+** (`vp`), la que ya trae `apps/store-web`: Vite, Rolldown, Vitest, Oxlint y Oxfmt |
| Framework | **React 19** con TypeScript |
| Rutas | **TanStack Router**, por archivos. Los parámetros de URL llevan tipos (`/?q=&page=`) y `beforeLoad` exige la sesión |
| Datos del servidor | **TanStack Query**: caché, reintentos y estados de carga y error |
| Cliente de API | **openapi-typescript + openapi-fetch**, con los tipos generados del contrato del backend |
| Formularios | **React Hook Form + Zod 4** (Zod ya es la librería de validación del backend) |
| Estado del cliente | **Zustand** con `persist` para el carrito (DP-04). Todo lo demás es estado de servidor o de la URL |
| Estilos y componentes | **Tailwind CSS 4 + shadcn/ui** (Radix): accesibilidad AA lista (foco, teclado, ARIA). Los valores visuales (colores, tipografía, espaciado) son los [tokens de diseño](../product/diseno/01-tokens.md), en un solo archivo, `src/styles.css`; los componentes propios, los de [02-componentes](../product/diseno/02-componentes.md) |
| Pruebas | **Vitest** (el de Vite+) + **Testing Library + MSW**; Playwright cuando el flujo de compra esté armado |
| Montos | **Nunca se calculan ni se convierten a número** (RN-08): se muestran los textos de la API |
| Sesión | Token de acceso **en memoria** y token de refresco en **`localStorage`** (DP-16), con renovación serializada entre pestañas |
| Idioma | Solo `es-PE`; el texto vive en un solo lugar para poder traducirlo después |

Todo lo anterior son las decisiones del [producto](../product/09-decisiones-y-preguntas.md) llevadas a lo técnico. Si algo cambia, se cambia primero ahí.

## 2. Stack

| Pieza | Para qué | Nota |
|---|---|---|
| Vite+ 1.4 | Servidor, compilación, lint, formato y pruebas | Ya instalado. `vp dev`, `vp build`, `vp check`, `vp test` |
| TypeScript 6 | Tipos | Ya instalado. Ver las restricciones de abajo |
| React 19 | Interfaz | |
| `@tanstack/react-router` + su plugin de Vite | Rutas por archivos, con tipos | El plugin genera `routeTree.gen.ts` |
| `@tanstack/react-query` | Datos del servidor | |
| `openapi-typescript`, `openapi-fetch` | Tipos y cliente desde OpenAPI | Script `api:types`, ver [03](03-integracion-con-la-api.md) |
| `react-hook-form`, `@hookform/resolvers`, `zod` | Formularios y validación de forma | El servidor decide siempre; la validación del cliente solo avisa antes |
| `zustand` | Carrito persistido | |
| `tailwindcss` (+ su plugin de Vite) y `shadcn/ui` | Estilos y componentes | Los componentes de shadcn se copian al repo en `shared/ui/` |
| `vitest`, `@testing-library/react`, `msw`, un paquete de axe para Vitest | Pruebas y accesibilidad | Vitest ya viene con Vite+ |
| `@playwright/test` | e2e del flujo de compra | Se añade en el corte F6 |

> [!tip] Versiones reproducibles
> Como en el backend: se instala todo con `-E` (versión exacta), se sube `pnpm-lock.yaml` y se valida el conjunto en CI. Antes de instalar se comprueba la versión vigente de cada paquete; esta tabla no fija números a propósito.

### Qué NO se agrega

ESLint, Prettier, Jest ni Babel (ya existen Oxlint, Oxfmt y Vitest dentro de Vite+); Redux (el estado de servidor lo cubre TanStack Query y el del cliente es solo el carrito); una librería decimal (el frontend no calcula montos); ni una librería de fechas (`Intl.DateTimeFormat` basta).

### Restricciones del TypeScript que ya hay

La configuración de la plantilla se **conserva** y se amplía lo mínimo (`jsx`, alias `@/*`):

- `erasableSyntaxOnly`: nada de `enum`, `namespace` ni propiedades de parámetro en constructores. Se usan uniones de literales y objetos `as const`.
- `verbatimModuleSyntax`: los imports de solo tipos llevan `import type`.
- `noUnusedLocals` y `noUnusedParameters`: el compilador y el lint fallan con código sin usar.
- El lint corre con tipos (`typeAware`, `typeCheck`) y con la regla `vite-plus/prefer-vite-plus-imports`: se importa de `vite-plus` y no de `vite` ni `vitest`.
- Los imports llevan la extensión del archivo (`.ts`, `.tsx`), como en la plantilla. El CLI de shadcn genera imports sin extensión: se ajustan al añadir cada componente.

## 3. Arquitectura

Se organiza **por funcionalidad**, y cada una refleja un contexto del backend:

```mermaid
flowchart TB
    subgraph APP["apps/store-web/src"]
        ROUTES["routes/<br/>archivos de ruta, delgados"]
        subgraph FEAT["features/"]
            CAT["catalog"]
            AUTH["auth"]
            CART["cart"]
            CHECK["checkout"]
            ORD["orders"]
        end
        SHARED["shared/<br/>api · ui · lib · config"]
    end
    ROUTES --> FEAT
    CHECK --> CART
    FEAT --> SHARED
    SHARED --> API[("🔌 API de LibroYa<br/>/docs-json")]
```

**Reglas** (las comprobará `test/unit/dependency-rules.test.ts`, que lee los imports como hace la prueba equivalente del backend):

1. **Una funcionalidad no importa las entrañas de otra.** Solo su API pública, `features/<x>/index.ts`. La única dependencia prevista es `checkout → cart` (el carrito y su total).
2. **`shared/` no importa de `features/` ni de `routes/`.**
3. **`routes/` solo conecta:** cada archivo declara la ruta, su acceso (`beforeLoad`) y qué página de `features/` muestra. No lleva lógica.
4. **Solo `shared/api/` habla con la red.** Ninguna página llama a `fetch`; usa los hooks de su funcionalidad, que usan el cliente.
5. **Los montos son texto** de la API (`{ amount, currency }`) hasta el momento de mostrarlos. No se convierten a `number` (RN-08).
6. **El mensaje al usuario sale del `errorCode`**, nunca del `message` de la API (ver [03](03-integracion-con-la-api.md) y [`07-contenido-y-mensajes`](../product/07-contenido-y-mensajes.md)).
7. **Dónde vive cada estado:** del servidor, en TanStack Query; de la navegación (búsqueda, página), en la URL; de la sesión, en `features/auth`; del carrito, en `features/cart`; del intento de pago en curso, en `sessionStorage`.

### Qué es de cada lado

| Pregunta | La responde |
|---|---|
| ¿Cuánto cuesta el pedido, el envío y el descuento? | El backend (cotización, RN-08) |
| ¿Hay stock? | El backend, al pagar (RN-13) |
| ¿Es premium? | El backend. El frontend no lo sabe (DP-10) |
| ¿La contraseña es débil, el correo válido? | El backend. El formulario solo avisa de lo obvio (largo mínimo, correo con forma) |
| ¿Qué muestro para cada error? | El frontend, según el `errorCode` |
| ¿Cuántas unidades caben en el carrito? | Los dos: el frontend avisa (RN-10), el backend decide |
