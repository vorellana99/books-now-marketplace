# LibroYa: guía del frontend

Guía de implementación de la tienda web (`apps/store-web`): React 19 + TypeScript sobre **Vite+** (`vp`). Este archivo es el índice. **Qué** hace la tienda lo define [`../product/`](../product/README.md) (historias `HU-nn`, reglas `RN-nn`, pantallas `PA-nn`, decisiones `DP-nn`); esta carpeta dice **cómo** se construye y cita esos identificadores en lugar de repetirlos. Lo que la API ofrece está en [`../api-contrato.md`](../api-contrato.md).

> [!caution] Estado
> **Ningún corte está implementado todavía.** `apps/store-web` sigue siendo la plantilla de Vite+ (un contador en TypeScript vanilla). Todo el stack de esta guía está **decidido pero sin instalar**. Las versiones se fijan con `-E` al instalar, y los bocetos de código de [05-piezas-clave](05-piezas-clave.md) se validan al implementarlos.

Los comandos se ejecutan desde `apps/store-web`. Las herramientas son las de Vite+ (`vp dev`, `vp check`, `vp test`, `vp build`); no se agregan ESLint, Prettier ni Jest.

| Documento | Contenido |
|---|---|
| [00-avance](00-avance.md) | **Control de avance** por cortes (`F0`…`F6`): tareas, desvíos de la guía y bitácora |
| [01-decisiones-y-stack](01-decisiones-y-stack.md) | Decisiones, stack, capas y reglas de dependencia |
| [02-estructura-y-puesta-en-marcha](02-estructura-y-puesta-en-marcha.md) | Carpetas, instalación, scripts, proxy y variables de entorno |
| [03-integracion-con-la-api](03-integracion-con-la-api.md) | Cliente generado, sesión y renovación de tokens, errores, idempotencia y qué endpoints faltan |
| [04-flujos-de-pantalla](04-flujos-de-pantalla.md) | Rutas, accesos, búsqueda en la URL, y los estados del carrito, la sesión y el pago |
| [05-piezas-clave](05-piezas-clave.md) | Bocetos de las piezas difíciles: cliente, sesión, carrito, clave de idempotencia y errores |
| [06-tests](06-tests.md) | Estrategia de pruebas y casos mínimos, por historia |
| [07-fases-y-roadmap](07-fases-y-roadmap.md) | Orden de los cortes y su dependencia con el backend |
| [`../product/diseno/`](../product/diseno/README.md) | **Diseño**: tokens, componentes y wireframes de las diez pantallas (fuente visual de esta guía) |

## Del producto al código

| Producto | Dónde se materializa |
|---|---|
| `HU-nn` (historia) | Una tarea de [00-avance](00-avance.md) la cita, y [06-tests](06-tests.md) dice con qué prueba se comprueba |
| `PA-nn` (pantalla) | Una ruta de [04-flujos-de-pantalla](04-flujos-de-pantalla.md) y una carpeta de `features/` |
| `RN-nn` (regla) | Casi siempre vive en el backend; el frontend solo la muestra o la anticipa (RN-08) |
| `DP-nn` (decisión) | Se refleja en [01-decisiones-y-stack](01-decisiones-y-stack.md) cuando es técnica |
