---
id: EN-nn
titulo: Título corto del habilitador
tipo: EN
estado: propuesta
amplia:
reemplaza:
ligado: backend/05-piezas-clave.md#convención-por-contexto
---

# EN-nn Título corto del habilitador

> **Al copiar la plantilla**
>
> | Qué | Cómo |
> |---|---|
> | Dónde va | `docs/historias/fase-n/EN/EN-nn.md`, en la carpeta de la fase en que se trabajará |
> | Nombre | **Solo el correlativo**, sin título; igual al `id` del encabezado |
> | Enlaces | Relativos, con `../../../` (por ejemplo `../../../product/03-reglas-de-negocio.md`) |
> | Valores | Qué admite cada campo y cada columna está en el [diccionario](README.md) |
> | Esta nota | Bórrala |
>
> **Estado:** 📝 propuesta (cámbialo en el encabezado; los estados, su significado y sus transiciones están en el [diccionario](README.md#estados-de-una-historia-o-un-habilitador); un pendiente que aún no se desglosa es una `idea`, con la plantilla [`idea.md`](idea.md); un habilitador **no** lleva `epica` y **sí** `ligado`)
>
> **Campos del encabezado**
>
> | Campo | Obligatorio en | Qué lleva |
> |---|---|---|
> | `id` | historias y habilitadores | `HU-nn` o `EN-nn`; igual al nombre del archivo sin `.md` |
> | `titulo` | historias y habilitadores | Una línea; es el nombre que aparece en la matriz |
> | `tipo` | historias y habilitadores | `HU` o `EN`; debe coincidir con el prefijo del `id` |
> | `estado` | historias y habilitadores | Uno de los estados de la tabla de abajo |
> | `amplia` | opcional | El `id` de una historia anterior que esta amplía (la anterior no se edita); vacío si no amplía ninguna |
> | `reemplaza` | opcional | El `id` de la historia que esta deja sin efecto por completo; vacío si no |
> | `ligado` | solo habilitadores | A qué se debe: una `RN-nn`, una `DP-nn` o la ruta de un documento de `docs/` con ancla opcional; el comprobador verifica que exista |
>
> **Estados de una historia o un habilitador**
>
> | Valor | Icono | Qué significa | Cuándo se pone |
> |---|---|---|---|
> | `idea` | 💡 | Un pendiente anotado, sin desglosar | Al crear el archivo desde [`idea.md`](idea.md) |
> | `propuesta` | 📝 | Desglosada y a la espera de aprobación | Al desglosarla (`/hu`) o al promover una idea |
> | `aprobada` | ⬜ | Aprobada por el usuario: puede ejecutarse | Cuando el usuario la aprueba |
> | `en-curso` | 🔄 | Alguna de sus tareas ya empezó | Al pasar su primera tarea a `en-curso` |
> | `cerrada` | ✅ | Todas sus tareas están hechas y su «Listo cuando…» se ejecutó | Al terminar la última tarea (en una historia, tras su `[E2E]`) |
>
> **Secciones de la plantilla**
>
> | Sección | Cuándo va | Qué lleva |
> |---|---|---|
> | `Lo que hay hoy (con su fuente)` | Siempre | Cada hecho en que se apoya el plan, con el archivo de donde sale |
> | `Criterios` | Siempre | Escenarios **Dado / cuando / entonces** |
> | `Listo cuando` | Siempre | El escenario de punta a punta que prueba la tarea `[E2E]`, contra el backend real |
> | `Contrato` | Si hay una tarea `[API]` | Lo que se aprueba de la API: rutas, cuerpo, respuesta, errores, compatibilidad. Si no cambia nada: «Sin cambios en el contrato» |
> | `Pantalla` | Si hay una tarea `[WEB]` | Lo que se aprueba de lo que se ve: dónde, croquis, estados, textos, móvil y escritorio. Si no cambia nada: «Sin cambios visuales» |
> | `Impacto en el producto` | Siempre | Qué documentos vivos (`RN`, `DP`, `PA`…) toca, con su acción y su estado. Si no toca ninguno: «Sin impacto en el producto» |
> | `Tareas` | Siempre | La tabla de tareas: el índice, una fila por tarea |
> | `Ejecución` | Siempre | Inicio, fin y tiempo de cada tarea; lo completa `scripts/historias.py` |
> | `Detalle de las tareas` | Siempre | Un bloque por tarea con sus casillas «Se comprueba» |
> | `Riesgos` | Opcional | Lo que puede salir mal al ejecutar el habilitador y cómo se comprueba |
> | `Decisiones y desvíos` | Siempre | Lo que se decidió o se apartó del plan, y por qué |
> | `Bitácora` | Siempre | Una fila por tarea hecha, con los conteos reales de la compuerta |

| Campo | Contenido |
|---|---|
| Para | … (el resultado técnico que se busca) |
| Porque | … (el motivo; qué pasa si no se hace) |
| Ligado a | El documento o la regla de `ligado:`, con su enlace escrito con `../../../` (una `RN`/`DP`, o una decisión de arquitectura de `docs/backend/`) |

## Lo que hay hoy (con su fuente)

> Cada hecho en que se apoya el plan, con el archivo (y la línea) de donde sale: sin una fuente, no es un hecho.

| Hecho | Fuente |
|---|---|
| … | `ruta/al/archivo` |

## Criterios

| Dado | Cuando | Entonces |
|---|---|---|
| … | … | … |

## Listo cuando

El escenario de punta a punta que prueba la tarea `[E2E]`, contra el backend real.

## Contrato

> **Diagrama opcional: de secuencia** (bloque `mermaid` con `sequenceDiagram`) si importa el orden de una conversación entre piezas (tienda → API → Inventario) o cómo falla algo. Uno, pequeño, con los textos y códigos reales; no repite el ejemplo JSON.
>
> Obligatoria si la historia tiene alguna tarea `[API]` (el comprobador la exige). Es lo que se aprueba con la historia; la tarea `[API]` lo cumple tal cual y, si hay que cambiarlo, se vuelve a aprobar. Si no cambia nada, escribe «Sin cambios en el contrato».
>
> **Qué lleva el contrato**
>
> | Parte | Qué se escribe |
> |---|---|
> | Rutas y métodos | Cada ruta y su método HTTP |
> | Cuerpo de la petición | Los campos, cuáles son obligatorios y sus reglas |
> | Respuesta | Un **ejemplo JSON** real |
> | Errores nuevos | El código y cuándo ocurre |
> | Compatibilidad | ¿Es aditivo? Si no, qué se rompe y cómo se migra |
> | Lo que no cambia | Para que quede claro lo que no se toca |

## Pantalla

> **Diagrama opcional:** de **estados** (`stateDiagram-v2`) si algo cambia de estado según un dato (Disponible, Quedan N, Agotado), o de **flujo** (`flowchart`) si una decisión tiene varias ramas. Uno, pequeño; el croquis y los textos exactos siguen siendo la fuente de verdad.
>
> Obligatoria si la historia tiene alguna tarea `[WEB]` (el comprobador la exige). Lo que se aprueba de lo que **se ve**. Reutiliza los tokens y componentes de `product/diseno/`; una pantalla nueva o un componente grande se hace antes, en una tarea `[DOC]` que actualiza el wireframe y el mockup. Si no cambia nada que se vea, escribe «Sin cambios visuales».
>
> **Qué lleva la pantalla**
>
> | Parte | Qué se escribe |
> |---|---|
> | Dónde va | Respecto a qué elemento de la pantalla va lo que cambia |
> | Croquis | Un croquis en texto, si una frase no basta |
> | Estados | Normal, vacío, cargando, error, agotado… |
> | Textos exactos | Los de `product/07`, tal cual se verán |
> | Móvil y escritorio | Qué cambia entre 360 px y 1280 px |
> | Accesibilidad | Texto además del color; objetivos táctiles de al menos 44 px |

## Impacto en el producto

> Obligatoria en toda historia (el comprobador la exige). **Los documentos de `docs/product/` (reglas `RN`, decisiones `DP`, pantallas `PA`, contenido, visión…) y `docs/api-contrato.md` dicen siempre lo que es verdad hoy; la historia es el registro del cambio.** Esta tabla dice qué documentos vivos toca la historia, y se aprueba con ella:
>
> | Documento | Qué cambia | Acción | Estado |
> |---|---|---|---|
> | `RN-13`, `DP-05` o `PA-02` (su id), o una ruta relativa a `docs/` (`product/07-contenido-y-mensajes.md`) | Una frase: qué dirá el documento después | una acción de la tabla de abajo | una de la tabla de abajo |
>
> **Acciones del impacto en el producto**
>
> | Valor | Qué significa |
> |---|---|
> | `agrega` | El documento (una regla, una decisión) todavía no existe y esta historia lo crea |
> | `modifica` | El documento existe y esta historia cambia lo que dice |
> | `retira` | El documento deja de valer; su línea lo dice («Retirada» o «reemplazada por …») |
>
> **Estados del impacto en el producto**
>
> | Valor | Qué significa |
> |---|---|
> | `pendiente` | Aún no está escrito en el documento vivo |
> | `hecho` | Ya está escrito y la línea del documento lleva la marca `Cambios: HU-nn (fecha)` |
>
> Si no toca ninguno, escribe «Sin impacto en el producto».
>
> **Cómo se mantiene el impacto**
>
> | Paso | Cuándo | Qué se hace |
> |---|---|---|
> | 1 | Antes del código | En la primera tarea `[DOC]`: se **reescribe** la regla, decisión o pantalla para que diga lo vigente (no se le añade «ahora además…»), y su línea termina con la marca **`Cambios: HU-nn (AAAA-MM-DD)`**, que acumula historias (`Cambios: HU-30 (2026-10-30), HU-12 (2026-10-31)`). Si el texto anterior importa, `· antes: «…»` en esa misma línea |
> | 2 | Si algo se reemplaza o se retira | Una decisión que otra reemplaza **no se borra**: se marca «reemplazada por DP-nn» (y la nueva `agrega`). Una regla o pantalla que se `retira` lo dice en su línea («Retirada») |
> | 3 | Al escribirlo en el documento | La fila pasa a `hecho` cuando la marca está en el documento; el comprobador verifica que existe lo citado, que la marca está, que la historia no se cierra con filas `pendiente`, y avisa si **dos historias abiertas** cambian a la vez lo mismo |
> | 4 | Siempre | `python3 scripts/historias.py` genera con estas tablas el registro de cambios (`docs/product/cambios.md`). No se edita a mano |

## Tareas

> **La tabla es el índice** (se escanea de un vistazo); **el detalle de cada tarea vive en su bloque**, en «Detalle de las tareas» (más abajo). Una fila no puede llevar el carácter `|` dentro de una celda.
>
> **Columnas de la tabla de tareas**
>
> | Columna | Qué lleva |
> |---|---|
> | `#` | El id de la tarea (`HU-nn.k` o `EN-nn.k`) |
> | `Capa` | Dónde se trabaja (tabla «Capas de una tarea») |
> | `Tipo` | Qué cambia, y por tanto qué receta aplica (el [diccionario](README.md#tipos-de-tarea) lo explica) |
> | `Rigor` | Qué tan crítica es (tabla «Rigor de una tarea») |
> | `Tarea` | Qué se hace, en una línea |
> | `Objetivo` | El resultado que se busca, en una frase: responde «¿para qué existe esta tarea?», no «cómo se programa» |
> | `Depende de` | Otra tarea (aunque sea de otra historia) o `—` |
> | `Estado` | Uno de los estados de la tabla «Estados de una tarea» |
>
> **Capas de una tarea**
>
> | Valor | Icono | Qué significa |
> |---|---|---|
> | `DOC` | 📄 | Producto y guías: reglas, decisiones, mensajes, diseño, documentos del proceso |
> | `API` | ⚙️ | El backend (`apps/main-api`) y, por ahora, también las herramientas del propio proceso (`scripts/`) |
> | `WEB` | 🌐 | La tienda (`apps/store-web`) |
> | `E2E` | 🧪 | El recorrido de punta a punta contra el backend real, o una comprobación completa de la solución |
>
> **Rigor de una tarea**
>
> | Valor | Icono | Qué significa |
> |---|---|---|
> | `critico` | 🔴 | Mutaciones obligatorias y plan corto antes de codificar; solo una tarea `[API]`; `base-de-datos` y `evento` siempre lo son |
> | `normal` | 🟢 | El resto |
>
> **Estados de una tarea**
>
> | Valor | Icono | Qué significa | Cuándo se pone |
> |---|---|---|---|
> | `propuesta` | ✏️ | Tarea de una historia que aún no está aprobada | Al desglosar la historia |
> | `pendiente` | ⏳ | Aprobada y sin empezar | Al aprobar la historia |
> | `en-curso` | ⏩ | Empezada (el script sella su inicio) | Al empezar a ejecutarla |
> | `hecho` | ✅ | Terminada, con todas las casillas de su bloque marcadas (el script sella su fin) | Al terminar su commit |
> | `bloqueado` | ⛔ | No puede avanzar; se dice por qué en «Decisiones y desvíos» | Cuando algo la detiene |
>
> **Cómo se escribe cada celda de la tabla de tareas**
>
> | Celda | Formato | Ejemplo |
> |---|---|---|
> | `Capa`, `Tipo`, `Rigor`, `Estado` | «icono texto»: el texto es el valor (kebab-case: minúsculas, sin acentos ni símbolos, con guiones en vez de espacios) | `⚙️ API`, `📜 contrato`, `🔴 critico`, `⏳ pendiente` |
> | `Depende de` | El id de otra tarea (aunque sea de otra historia), varias separadas por coma, o `—` | `HU-12.1, EN-02.3` |
> | Cualquier celda | Sin el carácter de la barra vertical, que separa las columnas | — |
>
> **El icono de cada valor es siempre el mismo**, en **todas** las filas: si falta o no coincide, el comprobador lo señala, y `python3 scripts/historias.py --formato` los completa y corrige (puedes escribir solo el texto).
>
> **Tipo** y **Rigor** se eligen por lo que cambia, no por cómo se programa: la tabla de tipos, su receta y el significado de cada valor están en el [diccionario](README.md#tipos-de-tarea) (`python3 scripts/historias.py --tipos` la imprime).
>
> **Diagrama opcional: de flujo** con las dependencias entre tareas, solo si son más de 5 o cruzan varias historias.

| # | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado |
|---|---|---|---|---|---|---|---|
| EN-nn.1 | 📄 DOC | 📦 producto | 🟢 normal | … | … | — | ✏️ propuesta |
| EN-nn.2 | ⚙️ API | 📜 contrato | 🟢 normal | … | … | EN-nn.1 | ✏️ propuesta |
| EN-nn.3 | 🌐 WEB | 🖼️ pantalla | 🟢 normal | … | … | EN-nn.2 | ✏️ propuesta |
| EN-nn.4 | 🧪 E2E | 🔁 recorrido | 🟢 normal | … | … | EN-nn.3 | ✏️ propuesta |

## Ejecución

> **Inicio, fin y tiempo de cada tarea.** Lo completa `scripts/historias.py` (no se edita a mano): sella el **inicio** cuando una tarea pasa a `⏩ en-curso` y el **fin** cuando pasa a `✅ hecho`, con la hora de Lima; el **tiempo** es fin − inicio e **incluye las esperas** (aprobaciones, pausas). Una fila por tarea, en el mismo orden. Si la sección no existe, el script la crea la primera vez que se ejecuta. Es una tabla aparte para que la de tareas siga siendo un índice legible.

<!-- EJECUCION:INICIO (la completa scripts/historias.py: no editar a mano) -->
| # | Inicio | Fin | Tiempo |
|---|---|---|---|
| EN-nn.1 | — | — | — |
| EN-nn.2 | — | — | — |
<!-- EJECUCION:FIN -->

## Detalle de las tareas

> Un bloque por tarea, con el mismo id que su fila. Una tarea está **lista para ejecutarse** cuando su primera comprobación basta para escribir la primera prueba roja. Lo que lleva cada bloque:
>
> **Qué lleva el bloque de una tarea**
>
> | Parte | Cuándo | Qué es |
> |---|---|---|
> | Se comprueba | Siempre | Una **lista de casillas** (`- [ ]`): cada una concreta y verificable; se marcan (`- [x]`) al cumplirse y una tarea `hecho` las tiene todas marcadas |
> | Reglas e invariantes | Si el rigor es `critico` | Lo que nunca debe dejar de cumplirse: es lo que las mutaciones comprueban |
> | Pantalla | Una `[WEB]` que cambia lo que se ve | La pantalla de la tarea; se revisa en un navegador real a 360 y 1280 px |
> | Contrato | Una `[API]` que cambia la API | El contrato de la tarea |
> | Escenario | Una `[E2E]` | El escenario paso a paso |

### EN-nn.1 Título de la tarea

**Se comprueba**

- [ ] …

### EN-nn.2 Título de la tarea

**Se comprueba**

- [ ] …

**Reglas e invariantes** (solo si el rigor es `critico`)

- …

## Riesgos

Lo que puede salir mal al ejecutar el habilitador y cómo se comprueba. **No** la lista de archivos y clases: eso se decide al ejecutar cada tarea con `/tarea` y se desactualiza.

## Decisiones y desvíos

| Fecha | Qué se decidió o se desvió | Por qué |
|---|---|---|

## Bitácora

| Fecha | Qué se hizo (con los conteos reales de la compuerta) |
|---|---|
