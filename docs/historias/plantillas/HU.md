---
id: HU-nn
titulo: Título corto de la historia
tipo: HU
epica: Catálogo | Cuenta | Carrito | Compra | Pedidos | Administración
estado: propuesta
amplia:
reemplaza:
---

# HU-nn Título corto de la historia

> **Dónde va:** cópiala a `docs/historias/fase-n/HU/HU-nn.md` (la carpeta de la fase en que se trabajará; el nombre es **solo el correlativo**, sin título) y escribe los enlaces relativos con `../../../` (por ejemplo `../../../product/03-reglas-de-negocio.md`). Qué valor admite cada campo y cada columna está en el [diccionario](README.md). Borra esta nota.
>
> **Estado:** 📝 propuesta (cámbialo en el encabezado; los estados, su significado y sus transiciones están en el [diccionario](README.md#estados-de-una-historia-o-un-habilitador); un pendiente que aún no se desglosa es una `idea`, con la plantilla [`idea.md`](idea.md))

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

## Impacto en el producto

> Obligatoria en toda historia (el comprobador la exige). **Los documentos de `docs/product/` (reglas `RN`, decisiones `DP`, pantallas `PA`, contenido, visión…) y `docs/api-contrato.md` dicen siempre lo que es verdad hoy; la historia es el registro del cambio.** Esta tabla dice qué documentos vivos toca la historia, y se aprueba con ella:
>
> | Documento | Qué cambia | Acción | Estado |
> |---|---|---|---|
> | `RN-13`, `DP-05` o `PA-02` (su id) · o una ruta relativa a `docs/` (`product/07-contenido-y-mensajes.md`) | Una frase: qué dirá el documento después | `agrega` · `modifica` · `retira` | `pendiente` · `hecho` |
>
> Si no toca ninguno, escribe «Sin impacto en el producto». **Cómo se mantiene:**
> 1. Se escribe **antes del código**, en la primera tarea `[DOC]` de la historia: se **reescribe** la regla, decisión o pantalla para que diga lo vigente (no se le añade «ahora además…»), y su línea termina con la marca **`Cambios: HU-nn (AAAA-MM-DD)`**, que acumula historias (`Cambios: HU-30 (2026-10-30), HU-12 (2026-10-31)`). Si el texto anterior importa, `· antes: «…»` en esa misma línea.
> 2. Una decisión que otra reemplaza **no se borra**: se marca «reemplazada por DP-nn» (y la nueva `agrega`). Una regla o pantalla que se `retira` lo dice en su línea («Retirada»).
> 3. La fila pasa a `hecho` cuando la marca está en el documento; el comprobador lo verifica (existe lo citado, la marca está, la historia no se cierra con filas `pendiente`) y avisa si **dos historias abiertas** cambian a la vez lo mismo.
> 4. `python3 scripts/historias.py` genera con estas tablas el registro de cambios (`docs/product/cambios.md`): qué cambió, cuándo y por qué historia. No se edita a mano.

## Tareas

> **La tabla es el índice** (se escanea de un vistazo); **el detalle de cada tarea vive en su bloque**, en «Detalle de las tareas» (más abajo). Una fila no puede llevar el carácter `|` dentro de una celda.
>
> **Columnas:** `#` (id de la tarea) · **Capa** · **Tipo** · **Rigor** · **Tarea** (qué se hace, en una línea) · **Objetivo** (el resultado que se busca, en una frase: responde «¿para qué existe esta tarea?», no «cómo se programa») · **Depende de** (otra tarea, aunque sea de otra historia, o `—`) · **Estado**.
>
> **Capa, Tipo, Rigor y Estado se escriben «icono texto»** (`⚙️ API`, `📜 contrato`, `🔴 critico`, `⏳ pendiente`). El texto es el valor (kebab-case: minúsculas, sin acentos ni símbolos, con guiones en vez de espacios) y **el icono de cada valor es siempre el mismo**, en **todas** las filas: si falta o no coincide, el comprobador lo señala, y `python3 scripts/historias.py --formato` los completa y corrige (puedes escribir solo el texto). Estados: `✏️ propuesta`, `⏳ pendiente`, `⏩ en-curso`, `✅ hecho`, `⛔ bloqueado`. Rigor: `🔴 critico` o `🟢 normal`.
>
> **Tipo** y **Rigor** se eligen por lo que cambia, no por cómo se programa: la tabla de tipos, su receta y el significado de cada valor están en el [diccionario](README.md#tipos-de-tarea) (`python3 scripts/historias.py --tipos` la imprime).
>
> **Diagrama opcional: de flujo** con las dependencias entre tareas, solo si son más de 5 o cruzan varias historias.

| # | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado |
|---|---|---|---|---|---|---|---|
| HU-nn.1 | 📄 DOC | 📦 producto | 🟢 normal | … | … | — | ✏️ propuesta |
| HU-nn.2 | ⚙️ API | 📜 contrato | 🟢 normal | … | … | HU-nn.1 | ✏️ propuesta |
| HU-nn.3 | 🌐 WEB | 🖼️ pantalla | 🟢 normal | … | … | HU-nn.2 | ✏️ propuesta |
| HU-nn.4 | 🧪 E2E | 🔁 recorrido | 🟢 normal | … | … | HU-nn.3 | ✏️ propuesta |

## Ejecución

> **Inicio, fin y tiempo de cada tarea.** Lo completa `scripts/historias.py` (no se edita a mano): sella el **inicio** cuando una tarea pasa a `⏩ en-curso` y el **fin** cuando pasa a `✅ hecho`, con la hora de Lima; el **tiempo** es fin − inicio e **incluye las esperas** (aprobaciones, pausas). Una fila por tarea, en el mismo orden. Si la sección no existe, el script la crea la primera vez que se ejecuta. Es una tabla aparte para que la de tareas siga siendo un índice legible.

<!-- EJECUCION:INICIO (la completa scripts/historias.py: no editar a mano) -->
| # | Inicio | Fin | Tiempo |
|---|---|---|---|
| HU-nn.1 | — | — | — |
| HU-nn.2 | — | — | — |
<!-- EJECUCION:FIN -->

## Detalle de las tareas

> Un bloque por tarea, con el mismo id que su fila. **Se comprueba** es una **lista de casillas** (`- [ ]`): cada una es algo concreto y verificable; se marcan (`- [x]`) al cumplirse y una tarea `hecho` las tiene todas marcadas. Una tarea está **lista para ejecutarse** cuando su primera comprobación basta para escribir la primera prueba roja. Una tarea con rigor `critico` lleva además **Reglas e invariantes** (lo que nunca debe dejar de cumplirse: es lo que las mutaciones comprueban). Detalle mínimo según la tarea: `[DOC]` y `[WEB]` simples, comprobaciones concretas; `[WEB]` que cambia lo que se ve, además la **Pantalla**, y se revisa en un navegador real a 360 y 1280 px; `[API]` que cambia la API, además el **Contrato**; `[E2E]`, el escenario paso a paso.

### HU-nn.1 Título de la tarea

**Se comprueba**

- [ ] …

### HU-nn.2 Título de la tarea

**Se comprueba**

- [ ] …

**Reglas e invariantes** (solo si el rigor es `critico`)

- …

## Notas de diseño (orientativas, no vinculantes)

Solo lo que condiciona y no debería cambiar (dónde vive una regla, qué dependencia va en qué sentido, riesgos). **No** la lista de archivos y clases: eso se decide al ejecutar cada tarea con `/tarea` y se desactualiza.

## Decisiones y desvíos

| Fecha | Qué se decidió o se desvió | Por qué |
|---|---|---|

## Bitácora

| Fecha | Qué se hizo (con los conteos reales de la compuerta) |
|---|---|
