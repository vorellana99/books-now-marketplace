# Historias de usuario: matriz y archivos

> Aquí están **todas** las historias de LibroYa en una sola tabla: las 20 que se hicieron antes del 2026-10-30 (histórico) y las nuevas. **Cada historia nueva vive en su propio archivo de esta carpeta** (`HU-12-ver-si-hay-stock-de-un-libro.md`): su texto, sus criterios, su «Listo cuando…», sus tareas por capa, sus decisiones y su bitácora. Lo transversal (problemas abiertos, decisiones generales) está en [`../avance.md`](../avance.md).

**Leyenda:** 📝 propuesta (sin aprobar) · ⬜ aprobada · 🔄 en curso · ✅ cerrada · — no aplica. La matriz se regenera con `python3 scripts/historias.py`; no se edita a mano.

## Matriz

<!-- MATRIZ:INICIO (la genera scripts/historias.py: no editar a mano) -->
| ID | Historia | Épica | Estado | API | Web | Inicio | Cierre | Tiempo | Tareas | Detalle |
|---|---|---|---|---|---|---|---|---|---|---|
| HU-01 | Registrarme | Cuenta | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 1 h 56 min | 4 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-01-registrarme) |
| HU-02 | Iniciar sesión | Cuenta | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 49 min | 3 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-02-iniciar-sesión) |
| HU-03 | Mantener la sesión | Cuenta | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 38 min | 2 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-03-mantener-la-sesión) |
| HU-04 | Cerrar sesión | Cuenta | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 35 min | 2 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-04-cerrar-sesión) |
| HU-10 | Buscar libros | Catálogo | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 35 min | 4 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-10-buscar-libros) |
| HU-11 | Ver un libro | Catálogo | ✅ cerrada | ✅ | ✅ | 2026-10-27 | 2026-10-30 | ≈ 16 min | 4 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-11-ver-un-libro) |
| HU-12 | Ver si hay stock de un libro | Catálogo | 📝 propuesta | ⬜ | ⬜ | — | — | — | 0 / 5 | [HU-12](HU-12-ver-si-hay-stock-de-un-libro.md) |
| HU-20 | Agregar un libro al carrito | Carrito | ✅ cerrada | — | ✅ | 2026-10-30 | 2026-10-30 | ≈ 12 min | 2 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-20-agregar-un-libro-al-carrito) |
| HU-21 | Cambiar la cantidad o quitar un libro | Carrito | ✅ cerrada | — | ✅ | 2026-10-30 | 2026-10-30 | ≈ 4 min | 1 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-21-cambiar-la-cantidad-o-quitar-un-libro) |
| HU-22 | Ver el carrito | Carrito | ✅ cerrada | ✅ | ✅ | 2026-10-29 | 2026-10-30 | ≈ 1 h 9 min | 6 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-22-ver-el-carrito) |
| HU-23 | El carrito marca los libros sin stock suficiente | Carrito | 📝 propuesta | — | ⬜ | — | — | — | 0 / 2 | [HU-23](HU-23-el-carrito-marca-los-libros-sin-stock-suficiente.md) |
| HU-30 | Indicar la dirección de envío | Compra | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 30 min | 3 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-30-indicar-la-dirección-de-envío) |
| HU-31 | Pagar y crear el pedido | Compra | ✅ cerrada | ✅ | ✅ | 2026-10-27 | 2026-10-30 | ≈ 2 h 3 min | 10 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-31-pagar-y-crear-el-pedido) |
| HU-32 | Reintentar sin cobrar dos veces | Compra | ✅ cerrada | ✅ | ✅ | 2026-10-27 | 2026-10-30 | ≈ 17 min | 2 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-32-reintentar-sin-cobrar-dos-veces) |
| HU-33 | Entender por qué falló la compra | Compra | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 22 min | 3 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-33-entender-por-qué-falló-la-compra) |
| HU-34 | Ver la confirmación | Compra | ✅ cerrada | ✅ | ✅ | 2026-10-27 | 2026-10-30 | ≈ 33 min | 3 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-34-ver-la-confirmación) |
| HU-35 | El error de pago nombra el libro sin stock | Compra | 📝 propuesta | ⬜ | ⬜ | — | — | — | 0 / 3 | [HU-35](HU-35-el-error-de-pago-nombra-el-libro.md) |
| HU-40 | Ver mis pedidos | Pedidos | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 1 h 37 min | 3 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-40-ver-mis-pedidos) |
| HU-41 | Ver el detalle de un pedido | Pedidos | ✅ cerrada | ✅ | ✅ | 2026-10-28 | 2026-10-30 | ≈ 42 min | 3 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-41-ver-el-detalle-de-un-pedido) |
| HU-50 | Crear un libro | Administración | 🔄 API hecha, Web pendiente | ✅ | ⬜ | 2026-10-28 | — | ≈ 1 h 11 min | 4 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-50-crear-un-libro) |
| HU-51 | Editar o desactivar un libro | Administración | 🔄 API hecha, Web pendiente | ✅ | ⬜ | 2026-10-28 | — | ≈ 22 min | 1 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-51-editar-o-desactivar-un-libro) |
| HU-52 | Cargar stock | Administración | 🔄 API hecha, Web pendiente | ✅ | ⬜ | 2026-10-28 | — | ≈ 17 min | 1 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-52-cargar-stock) |
| HU-53 | Ver los pedidos de un cliente | Administración | 🔄 API hecha, Web pendiente | ✅ | ⬜ | 2026-10-28 | — | ≈ 1 h 20 min | 2 (histórico) | [texto](../product/04-historias-de-usuario.md#hu-53-ver-los-pedidos-de-un-cliente) |
<!-- MATRIZ:FIN -->

**Cómo se lee**

- **Estado, API y Web de una historia nueva** salen de su archivo: el estado es el del encabezado; API y Web, de sus tareas (`[API]`, `[WEB]`): ✅ todas hechas, 🔄 alguna, ⬜ ninguna, — no tiene tareas de esa capa. **Tareas** = hechas / total.
- **Inicio, Cierre y Tiempo** salen de `git log` (hora de Lima): los commits `HU-nn.k [CAPA]: …` de la historia. El **tiempo** suma, por cada commit, los minutos desde el commit anterior (de cualquier historia) con un **tope de 60** para no contar noches ni pausas. La fecha de **cierre** solo existe cuando la historia está cerrada.
- **Las 20 historias anteriores (histórico)** tienen el **texto** en [`../product/04-historias-de-usuario.md`](../product/04-historias-de-usuario.md) (congelado, enlace en «Detalle») y sus datos en [`legado.json`](legado.json). Su **tiempo es aproximado** (`≈`): se construyeron en cortes que mezclaban varias historias, así que las tareas compartidas se cuentan completas en cada una (la lista está en `legado.json`) y el mapeo historia → tareas es una reconstrucción. HU-50 a HU-53 tienen la API hecha y la tienda pendiente (no tienen cierre).

## Cómo se trabaja una historia

El proceso paso a paso está en la [guía de desarrollo §4](../guia-de-desarrollo.md#4-del-requisito-a-la-tarea-el-ciclo). Las reglas:

| Regla | Detalle |
|---|---|
| **La unidad es la HU** | Todo cambio de producto parte de una historia. Una historia nueva se **redacta y se aprueba antes de desglosarla**. Lo que no es una historia (arquitectura, rendimiento, seguridad, accesibilidad, despliegue) es un **habilitador `EN-nn`** y se liga a la regla `RN` o al requisito de [`product/08`](../product/08-requisitos-de-experiencia.md) que lo justifica |
| **Una ampliación es una HU nueva** | Las historias anteriores a 2026-10-30 no se editan: lo que las amplía o cambia es una HU nueva con su propio número que dice en el encabezado `amplia: HU-22` |
| **Un archivo por historia** | `HU-nn-titulo-en-minusculas.md` (o `EN-nn-…`), con el encabezado y las secciones de la [plantilla](_plantilla.md). El nombre empieza por el `id` |
| **Las tareas salen de los criterios** | Cada criterio «Dado/Cuando/Entonces» se reparte en tareas **verticales**, cada una de **una sola capa**: `[API]` (backend), `[WEB]` (tienda), `[E2E]` (recorrido contra el backend real) o `[DOC]` (producto y guías, sin código) |
| **Numeración** | `HU-nn.k` es la tarea k de la historia nn. Es el prefijo del commit con su capa: `HU-12.3 [API]: Add availability to GET /books`. Los números no se reutilizan |
| **Pantalla por adelantado** | Si la historia tiene tareas `[WEB]`, su archivo lleva la sección **«Pantalla»**: **dónde** va lo que cambia, un croquis en texto si una frase no basta, los **estados**, los **textos exactos** (`product/07`), qué cambia entre móvil y escritorio y la accesibilidad; reutiliza los tokens y componentes de [`product/diseno/`](../product/diseno/README.md) (una pantalla nueva o un componente grande va antes en una tarea `[DOC]` que actualiza el wireframe y el mockup). El comprobador la exige («Sin cambios visuales» si no cambia nada) y la tarea `[WEB]` se **revisa en un navegador real a 360 y 1280 px**; no hay pruebas de captura píxel a píxel |
| **Contrato por adelantado, plan justo a tiempo** | Si la historia tiene tareas `[API]`, su archivo lleva la sección **«Contrato»** (rutas y métodos, cuerpo, **ejemplo JSON de la respuesta**, errores nuevos, compatibilidad y lo que no cambia), que se aprueba con la historia; el comprobador la exige. La tarea lo cumple tal cual y, si hay que cambiarlo, se vuelve a aprobar. El **plan de implementación** (archivos, clases) **no** va en la historia: se hace justo antes de cada tarea con `/tarea` (plan corto, solo en las `[API]` críticas o grandes) y no se guarda |
| **Lista para ejecutarse** | Una tarea lo está cuando alguien puede escribir su primera prueba roja leyendo solo su fila: `[DOC]` y `[WEB]` simples, un «Se comprueba» concreto; `[WEB]` que cambia lo que se ve, + la Pantalla; `[API]` que cambia la API, + el Contrato; `[API]` crítica, + reglas e invariantes; `[E2E]`, el escenario paso a paso |
| **Diagramas Mermaid (opcionales)** | Solo si una frase o una tabla no basta: **secuencia** (orden de una conversación o un fallo, en «Contrato»), **estados** (en «Pantalla») o **flujo** (una decisión con ramas, o las dependencias entre más de 5 tareas). Uno por idea, de unos 10 nodos, con los textos reales de la tienda y de la API; no duplican el ejemplo JSON ni el croquis y se actualizan en la misma tarea que cambie lo que muestran. En la terminal se ven como texto: llevan una frase que los resume |
| **Orden y dependencias** | Cada tarea dice de cuál depende (puede ser de otra historia). Orden normal: `[DOC]` → `[API]` → `[WEB]` (la primera lleva `/cambio-de-contrato`) → `[E2E]`. **Una tarea nunca deja la compuerta en rojo**: un cambio de contrato es primero **aditivo** |
| **Tipo y rigor** | La tabla de tareas tiene una columna **Tipo** después de la capa, que **se elige por lo que cambia**: `[API]` → `contrato` (**lo que la API le ofrece a la tienda**: un endpoint, **un campo más en una respuesta**, un error), `regla` (**cómo decide el negocio**: un cálculo, un límite), `evento`, `base-de-datos`, `configuracion`; `[WEB]` → `pantalla` (**lo que se ve**) o `comportamiento` (**lo que la tienda hace** sin cambiar lo que se ve); `[DOC]` → `producto` o `guia`; `[E2E]` → `recorrido`. Los nombres se escriben exactos, en **kebab-case** (minúsculas, sin acentos ni símbolos, con guiones en vez de espacios). Dice qué receta aplica (`/nueva-ruta`, `/nuevo-evento`, `/nueva-migracion`, `/nueva-variable-entorno`). **🔒** junto al tipo marca una tarea **crítica** (mutaciones obligatorias y plan corto): solo en `[API]`; `base-de-datos` y `evento` siempre la llevan. Un endpoint nuevo con lógica nueva son dos tareas (`regla` y `contrato`). La plantilla trae la tabla con ejemplos y el comprobador valida todo esto |
| **Un commit por tarea** | Pruebas primero → implementar → compuerta (`scripts/verify.sh`) → mutaciones si lleva 🔒 → documentos en el mismo commit → commit |
| **Qué se documenta al cerrar una tarea** | En el archivo de la historia: la casilla, la fila de la tabla (⬜ → ✅) y una fila de **su** bitácora con los conteos reales; «Decisiones y desvíos» si algo se apartó. Después, `python3 scripts/historias.py` regenera la matriz |
| **Cuándo se cierra** | Cuando todas sus tareas están ✅ **y** su «Listo cuando…» se ejecutó de verdad de punta a punta (la tarea `[E2E]`). Entonces `estado: cerrada` en el encabezado. El script no deja cerrar una HU sin `[E2E]` ni con tareas pendientes |
| **Preguntar** | Lo que cambia lo que se construye y no está en los documentos se pregunta con **opciones y una recomendada**. Una decisión de producto que la HU contradice (`RN`/`DP`) se resuelve en la tarea `[DOC]`, antes del código |

## Histórico: dónde quedó lo hecho antes

Lo construido en los cortes sigue siendo la base; esta tabla dice a qué historia o habilitador corresponde.

| Antes | Qué fue | Ahora es |
|---|---|---|
| Backend cortes 0–6 | Scaffold, fundaciones, dominio de Ventas, Catálogo e Inventario, Outbox, compra completa, funcionalidades de tienda | Base de HU-10, HU-11, HU-30 a HU-34 y HU-50 a HU-53 (API) |
| Backend corte 7 | Autenticación (JWT, refresco, roles, límites) y `GET /me/orders` | HU-01 a HU-04 y HU-40/41 (API) |
| Backend corte 8 | `POST /orders/quote` | HU-22 (API) |
| Backend cortes 9 y 10 | Endurecimiento, estructura y una sola arquitectura hexagonal | Habilitadores (arquitectura, robustez) |
| Tienda F0 | Fundaciones | Habilitador (base de la tienda) |
| Tienda F1 a F5 | Catálogo, cuenta y sesión, carrito, compra, pedidos | HU-10/11, HU-01 a HU-04, HU-20 a HU-22, HU-30 a HU-34, HU-40/41 (Web) |
| Tienda F6 | Accesibilidad, e2e, rendimiento, despliegue y seguridad | Habilitadores (requisitos de `product/08`) |

Los tableros por capa, [backend](../backend/00-avance.md) y [frontend](../frontend/00-avance.md), y la lista de historias de [`product/04`](../product/04-historias-de-usuario.md) quedan como **historial congelado**.
