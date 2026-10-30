---
id: HU-12
titulo: Ver si hay stock de un libro
tipo: HU
epica: Catálogo
estado: propuesta
amplia:
---

# HU-12 Ver si hay stock de un libro

> **Estado:** 📝 propuesta, pendiente de aprobación. Nace del pedido del 2026-10-30: «en la lista de libros no se indica si hay stock y recién al pagar sale un aviso». Es la primera de tres historias que comparten un mismo cambio de contrato (la disponibilidad en el catálogo y el `isbn` del error de stock): [HU-23](HU-23-el-carrito-marca-los-libros-sin-stock-suficiente.md) (el carrito) y [HU-35](HU-35-el-error-de-pago-nombra-el-libro.md) (el aviso de pago). Nada de esto está implementado.

**Como** comprador, **quiero** ver si un libro tiene stock desde la lista y desde su página, **para** no descubrirlo recién al pagar.
**Reglas:** RN-10 (máximo 10 por libro), RN-13 (hoy dice que la API no expone el stock: se reescribe en `HU-12.1`) · **Pantallas:** PA-01, PA-02 · **Rutas:** `GET /books`, `GET /books/:isbn`

**Decisiones del usuario (2026-10-30):** la API expone la cantidad **con tope en 10** (`min(unidades, 10)`: no regala el inventario completo, y el máximo por pedido ya es 10); va **dentro de `GET /books` y `GET /books/:isbn`** (la tienda ya llama a esas rutas; Catálogo le pregunta a Inventario por una consulta de contrato en proceso). Se registran como `DP-25` en `HU-12.1`. Recomendadas por mí y que se pueden cambiar al aprobar: la disponibilidad es **orientativa** (`POST /orders` sigue siendo la autoridad).

## Criterios

- **Dado** el catálogo, **cuando** veo un libro en la lista o en su página, **entonces** veo «Disponible» (6 o más), «Quedan N» (de 1 a 5) o «Agotado», siempre con texto además del color.
- **Dado** un libro agotado, **cuando** intento agregarlo, **entonces** el botón está deshabilitado y dice «Agotado».
- **Dado** un libro con 3 unidades, **cuando** lo agrego al carrito, **entonces** no puedo pasar de 3 y la tienda dice «Solo quedan 3».
- **Dado** que la disponibilidad es orientativa, **cuando** otra persona se lleva el último ejemplar antes de que yo pague, **entonces** el pago sigue siendo la autoridad y me lo dice ([HU-35](HU-35-el-error-de-pago-nombra-el-libro.md)).
- **Dado** un libro recién creado cuyo registro de stock aún no existe, **cuando** lo consulto, **entonces** figura como agotado, no como error.

## Listo cuando

Contra el backend real, una persona ve «Quedan 3» en un libro con 3 unidades y «Agotado» en uno sin stock, en la lista y en el detalle, a 360 y 1280 px y sin violaciones de axe, y no puede agregar más de lo que hay.

## Contrato

> Lo que se aprueba con la historia. La tarea `[API]` lo cumple tal cual; si al implementar hay que cambiarlo, se detiene y se vuelve a aprobar (no se decide al programar). Después de implementar, `docs/api-contrato.md` lo refleja.

**`GET /books?q=&page=&pageSize=`** y **`GET /books/:isbn`** (públicas, sin cambios en parámetros, ruta ni códigos de error). Cada libro de la respuesta gana un campo **`available`**:

```json
{
  "isbn": "9780132350884",
  "title": "Clean Code",
  "author": "Robert C. Martin",
  "price": { "amount": "45.00", "currency": "PEN" },
  "available": 3
}
```

| Campo | Tipo | Significado |
|---|---|---|
| `available` | entero, **siempre presente**, de 0 a 10 | `min(unidades disponibles, 10)`. `0` = agotado **o** libro sin registro de stock todavía. Es **orientativo**: puede quedar viejo, y `POST /orders` sigue decidiendo |

- **Compatibilidad: aditivo.** Un cliente que ignora `available` sigue funcionando. No se quita ni se renombra nada.
- **Errores:** los de hoy (`GET /books/:isbn`: `404 NOT_FOUND` si no existe o está inactivo, `422 INVALID_ISBN`); un libro sin registro de stock **no es un error**.
- **Una página** (`pageSize` hasta 50) pide la disponibilidad en **una sola** consulta.
- **No cambia:** `POST /orders/quote` (no mira el stock) ni `POST /orders`.
- **OpenAPI:** `BookResponse.available` como `integer`, `minimum: 0`, `maximum: 10`, requerido, con esta descripción.

**Cómo se obtiene `available`** (la tienda no hace nada distinto: sigue llamando a la misma ruta):

```mermaid
sequenceDiagram
    participant T as Tienda
    participant C as Catálogo
    participant I as Inventario
    T->>C: GET /books con página y búsqueda
    C->>I: Disponibilidad de los ISBN de la página, en una sola consulta
    I-->>C: Unidades por ISBN con tope en 10, y 0 si no hay registro
    C-->>T: Libros con available de 0 a 10
```

Resumen: Catálogo le pregunta a Inventario **una vez por página** y mezcla el resultado en cada libro.

## Pantalla

> Lo que se aprueba con la historia y se revisa en un navegador real a 360 y 1280 px. Reutiliza los [tokens](../product/diseno/01-tokens.md) y [componentes](../product/diseno/02-componentes.md) existentes; los wireframes PA-01 y PA-02 y el mockup PA-02 se actualizan en `HU-12.1`.

**Un componente nuevo y compartido: la nota de disponibilidad** (texto corto con un icono; el icono es decorativo y el significado siempre está en el texto, nunca solo en el color).

| Disponibles | Texto | Tono (tokens) |
|---|---|---|
| 6 a 10 | `Disponible` | éxito (`success`) |
| 2 a 5 | `Quedan N` | aviso (`warning`) |
| 1 | `Queda 1` | aviso (`warning`) |
| 0 | `Agotado` | error (`danger-text`) |

**En la lista (tarjeta de libro):** la nota va **entre el precio y el botón**, en su propia línea, sin cambiar el resto de la tarjeta.

```
┌─────────────────────────┐
│ Clean Code              │   título (enlace)
│ Robert C. Martin        │   autor
│ S/ 45.00                │   precio
│ ▲ Quedan 3              │   ← nota nueva (texto pequeño)
│ [ Agregar al carrito ]  │   botón; con 0 queda deshabilitado y dice «Agotado»
└─────────────────────────┘
```

**En el detalle del libro:**
- **Escritorio (1280 px):** la nota va **justo debajo del precio**, antes del botón.
- **Móvil (360 px):** la barra fija inferior (precio y botón) **no cambia de tamaño**; la nota va en el cuerpo, **bajo la línea del ISBN**. Solo cambia el botón: con 0 dice «Agotado» y queda deshabilitado.

**El botón:**
- Normal: sin cambios («Agregar al carrito»).
- Agotado: deshabilitado, texto «Agotado» y nombre accesible «Clean Code está agotado».
- Al llegar al límite (`min(10, disponibles)`): el aviso que hoy dice «Máximo 10 por pedido.» pasa a decir **«Solo quedan N.»** cuando el límite lo fija el stock; si el límite es 10, no cambia.

**Cómo cambia el texto de un libro** según las unidades que haya (por ejemplo, al comprarse unidades o al cargarse stock):

```mermaid
stateDiagram-v2
    direction LR
    state "Disponible" as D
    state "Quedan N" as Q
    state "Queda 1" as U
    state "Agotado" as A
    D --> Q: bajan a 5 o menos
    Q --> U: baja a 1
    U --> A: baja a 0
    A --> D: se carga stock hasta 6 o más
```

Resumen: 6 a 10 unidades → «Disponible», 2 a 5 → «Quedan N», 1 → «Queda 1», 0 → «Agotado».

**Todo igual en 360 y 1280 px** salvo la posición en el detalle de arriba. El botón conserva su alto táctil de al menos 44 px y el contraste de los tonos sale de los tokens (se comprueba con axe en `HU-12.5`).

## Tareas

| # | Capa | Tipo | Tarea | Se comprueba | Depende de | Estado |
|---|---|---|---|---|---|---|
| HU-12.1 | [DOC] | producto | Aprobar y registrar la decisión de producto de las tres historias | HU-12, HU-23 y HU-35 aprobadas; **RN-13** y **DP-05** reescritas; `DP-25` nueva (tope 10, dentro del catálogo, orientativa); `00-vision` (sale de «fuera de alcance»), PA-01/02/05, wireframes y mockup PA-02, `07-contenido` (textos «Disponible», «Quedan N», «Agotado» y los del error con título). `grep` de «no se muestra stock» sin restos. `product/04` no se toca (histórico) | aprobación del usuario | 📝 |
| HU-12.2 | [API] | regla 🔒 | Inventario: leer la disponibilidad con tope | Función pura `reportedAvailability` (tope 10, nunca negativa) y consulta de contrato por lote; un ISBN sin registro cuenta 0; **mutaciones** (dominio): tope, 0, fila ausente; el puerto de lectura tiene su fake y su contrato de pruebas contra la base real | HU-12.1 | 📝 |
| HU-12.3 | [API] | contrato | Catálogo: `available` en `GET /books` y `GET /books/:isbn` | Catálogo pregunta a Inventario por contrato (una consulta por página, máx. 50 ISBN); el detalle deja de reutilizar la consulta de precio de Ventas; cumple el **Contrato** de arriba (campo requerido, 0–10, aditivo); OpenAPI; `CLAUDE.md` y las guías 01/05 del backend dicen la nueva dirección de la dependencia (Catálogo → Inventario por contrato; Inventario nunca llama a Catálogo); specs de estructura exactos al día | HU-12.2 | 📝 |
| HU-12.4 | [WEB] | pantalla | Lista y detalle muestran la disponibilidad; el botón respeta el límite | `/cambio-de-contrato` (regenera `schema.d.ts`); componente de aviso compartido (`shared/ui`) y lo de la sección **Pantalla** (ubicación, textos, tonos, móvil y escritorio) **revisado en un navegador real a 360 y 1280 px**, con la captura anotada en la bitácora; «Agotado» deshabilita el botón; límite = min(10, disponibles); se reescribe la prueba «no muestra el stock» (`book-detail-page.test.tsx`) | HU-12.3 | 📝 |
| HU-12.5 | [E2E] | recorrido | Catálogo y detalle contra el backend real | Un libro con 3 unidades y otro sin stock (creados por la API de administración): «Quedan 3» y «Agotado» en lista y detalle, el botón respeta el límite; axe a 360 y 1280 px; `test:perf` sin regresión; contra `vp dev` y el build de producción | HU-12.4 | 📝 |

- [ ] HU-12.1 [DOC] Decisión de producto aprobada y registrada. Se comprueba: lo de la tabla
- [ ] HU-12.2 [API] Disponibilidad en Inventario. Se comprueba: lo de la tabla
- [ ] HU-12.3 [API] `available` en el catálogo. Se comprueba: lo de la tabla
- [ ] HU-12.4 [WEB] Lista, detalle y botón. Se comprueba: lo de la tabla
- [ ] HU-12.5 [E2E] Catálogo y detalle de punta a punta. Se comprueba: lo de la tabla

## Notas de diseño (orientativas, no vinculantes)

El detalle de implementación (qué archivos y clases) **se decide al ejecutar cada tarea** con `/tarea` (plan corto antes de codificar las `[API]` críticas); aquí solo lo que condiciona y no debería cambiar:

- **Inventario es dueño del número y del tope.** La función pura que aplica el tope (10, igual al máximo por pedido de RN-10) y la regla «sin registro de stock = 0» viven en el dominio de Inventario, que **no importa de Ventas**; es lo que se prueba con mutaciones.
- **Catálogo no ve el número real.** Le pregunta a Inventario por **contrato** (consulta en proceso, una por página) y la dependencia va en un solo sentido: Catálogo → Inventario; Inventario nunca llama a Catálogo. Hay que actualizar `CLAUDE.md` y las guías del backend, que hoy dicen que solo Ventas llama a otros contextos.
- **La tienda** muestra «Disponible» (6 o más), «Quedan N» (1 a 5) y «Agotado» con un componente compartido, siempre con texto además del color, y limita el carrito a `min(10, disponibles)`.
- **Riesgos:** es orientativo y puede quedar viejo; la ruta es pública y sin límite de intentos (por eso el tope en 10); la cotización sigue sin mirar el stock.

## Decisiones y desvíos

| Fecha | Qué se decidió o se desvió | Por qué |
|---|---|---|
| 2026-10-30 | Cantidad con tope en 10, dentro de `GET /books` y `GET /books/:isbn` (decisión del usuario) | Permite «Quedan N» y limitar el carrito sin regalar el inventario completo; cero llamadas extra de la tienda |
| 2026-10-30 | Las ampliaciones de HU-22 y HU-33 son historias nuevas (HU-23 y HU-35) | El histórico no se edita (decisión del usuario) |

## Bitácora

| Fecha | Qué se hizo |
|---|---|
| 2026-10-30 | Propuesta redactada y desglosada en 5 tareas, con exploración de solo lectura del backend y la tienda. Sin código ni documentos de producto cambiados |
