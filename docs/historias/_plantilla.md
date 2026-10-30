---
id: HU-nn
titulo: Título corto de la historia
tipo: HU
epica: Catálogo | Cuenta | Carrito | Compra | Pedidos | Administración
estado: propuesta
amplia:
---

# HU-nn Título corto de la historia

> **Estado:** 📝 propuesta (cámbialo en el encabezado: `propuesta` → `aprobada` → `en-curso` → `cerrada`). Si amplía una historia anterior, escribe su id en `amplia:` del encabezado y dilo aquí.

**Como** …, **quiero** …, **para** ….
**Reglas:** RN-… · **Pantallas:** PA-… · **Rutas:** …

## Criterios

- **Dado** …, **cuando** …, **entonces** ….

## Listo cuando

El escenario de punta a punta que prueba la tarea `[E2E]`, contra el backend real.

## Contrato

> **Diagrama opcional: de secuencia** (bloque `mermaid` con `sequenceDiagram`) si importa el orden de una conversación entre piezas (tienda → API → Inventario) o cómo falla algo. Uno, pequeño, con los textos y códigos reales; no repite el ejemplo JSON.
>
> Obligatoria si la historia tiene alguna tarea `[API]` (el comprobador la exige). Es lo que se aprueba con la historia: rutas y métodos, cuerpo de la petición, **respuesta con un ejemplo JSON**, errores nuevos (código y cuándo), compatibilidad (¿es aditivo?) y qué no cambia. Si no cambia nada, escribe «Sin cambios en el contrato». La tarea `[API]` lo cumple tal cual; si hay que cambiarlo, se vuelve a aprobar.

## Pantalla

> **Diagrama opcional:** de **estados** (`stateDiagram-v2`) si algo cambia de estado según un dato (Disponible, Quedan N, Agotado), o de **flujo** (`flowchart`) si una decisión tiene varias ramas. Uno, pequeño; el croquis y los textos exactos siguen siendo la fuente de verdad.
>
> Obligatoria si la historia tiene alguna tarea `[WEB]` (el comprobador la exige). Lo que se aprueba de lo que **se ve**: **dónde** va lo que cambia (respecto a qué elemento), un **croquis en texto** si una frase no basta, los **estados** (normal, vacío, cargando, error, agotado…), los **textos exactos** (los de `product/07`), qué cambia entre **móvil (360 px) y escritorio (1280 px)** y la **accesibilidad** (texto además del color, objetivos táctiles de al menos 44 px). Reutiliza los tokens y componentes de `product/diseno/`; una pantalla nueva o un componente grande se hace antes, en una tarea `[DOC]` que actualiza el wireframe y el mockup. Si no cambia nada que se vea, escribe «Sin cambios visuales».

## Tareas

> **Tipo** (segunda columna): dice qué receta aplica y **se elige por lo que cambia**, no por cómo se programa:
>
> | Capa | Tipo | ¿Qué cambia? | Ejemplos |
> |---|---|---|---|
> | `[API]` | `contrato` | **Lo que la API le ofrece a la tienda** | Un endpoint nuevo, **un campo más en una respuesta**, un error nuevo, quién puede llamarlo |
> | `[API]` | `regla` | **Cómo decide el negocio** | Un cálculo, un límite («máximo 10»), una condición |
> | `[API]` | `evento` | Un aviso entre partes del sistema (Outbox) | Reaccionar a «se registró un usuario» |
> | `[API]` | `base de datos` | Las tablas, columnas, índices o restricciones | Una columna nueva |
> | `[API]` | `configuración` | Una variable de entorno | `JWT_SECRET` |
> | `[WEB]` | `pantalla` | **Lo que se ve** | Mover un botón, un texto nuevo, un aviso |
> | `[WEB]` | `comportamiento` | **Lo que la tienda hace**, sin cambiar lo que se ve | Pedir el campo nuevo a la API, el estado del carrito, validar un formulario |
> | `[DOC]` | `producto` | Reglas, decisiones, historias, mensajes, diseño | `RN-13`, un `DP` |
> | `[DOC]` | `guía` | Guías técnicas, README, comandos | `CLAUDE.md` |
> | `[E2E]` | `—` | El recorrido de punta a punta | — |
>
> Un endpoint nuevo con lógica nueva son **dos tareas**: la `regla` y el `contrato`. **🔒** junto al tipo marca una tarea **crítica** (mutaciones obligatorias y plan corto antes de codificar): solo en `[API]`, y `base de datos` y `evento` siempre la llevan.
>
> **Diagrama opcional: de flujo** con las dependencias entre tareas, solo si son más de 5 o cruzan varias historias.
>
> Una tarea está **lista para ejecutarse** cuando alguien puede escribir su primera prueba roja leyendo solo su fila. Detalle mínimo: `[DOC]` y `[WEB]` simples, un «Se comprueba» concreto; `[WEB]` que cambia lo que se ve, además la **Pantalla**, y se revisa en un navegador real a 360 y 1280 px; `[API]` que cambia la API, el **Contrato**; `[API]` crítica (dominio, seguridad, dinero, concurrencia, migración o evento), además las reglas e invariantes; `[E2E]`, el escenario paso a paso.

| # | Capa | Tipo | Tarea | Se comprueba | Depende de | Estado |
|---|---|---|---|---|---|---|
| HU-nn.1 | [DOC] | producto | … | … | — | 📝 |
| HU-nn.2 | [API] | contrato | … | … | HU-nn.1 | 📝 |
| HU-nn.3 | [WEB] | pantalla | … | … | HU-nn.2 | 📝 |
| HU-nn.4 | [E2E] | — | … | … | HU-nn.3 | 📝 |

- [ ] HU-nn.1 [DOC] … Se comprueba: …

## Notas de diseño (orientativas, no vinculantes)

Solo lo que condiciona y no debería cambiar (dónde vive una regla, qué dependencia va en qué sentido, riesgos). **No** la lista de archivos y clases: eso se decide al ejecutar cada tarea con `/tarea` y se desactualiza.

## Decisiones y desvíos

| Fecha | Qué se decidió o se desvió | Por qué |
|---|---|---|

## Bitácora

| Fecha | Qué se hizo (con los conteos reales de la compuerta) |
|---|---|
