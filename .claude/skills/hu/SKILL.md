---
name: hu
description: Convertir una necesidad, una historia de usuario nueva, una ampliación o un habilitador técnico en tareas verticales por capa (API, WEB, E2E, DOC) para que el usuario las apruebe, sin escribir código. Úsalo ante cualquier pedido nuevo de funcionalidad o cambio de lo que ve o hace la persona ("quiero que la tienda…", "falta…", "desglosa la HU-nn"), ANTES de implementar nada.
---

# De la historia a las tareas

Todo cambio de producto parte de una historia de usuario (`HU-nn`). Una HU puede pedir cambios en el backend, en la tienda o en los dos: se desglosa en **tareas verticales de una sola capa** y se aprueba **antes** de escribir código. Cada historia nueva es **un archivo** en `docs/historias/` (plantilla: `docs/historias/_plantilla.md`) y la matriz de todas está en `docs/historias/README.md`; el proceso completo, en `docs/guia-de-desarrollo.md` §4.1.

**Este comando NO implementa.** Termina con el archivo de la historia en `docs/historias/` marcado 📝 y la pregunta de aprobación al usuario.

## 1. Entender

1. Lee la historia si existe (las anteriores a 2026-10-30 están en `docs/product/04-historias-de-usuario.md` como **histórico: no se editan**; las nuevas, en `docs/historias/`), o la necesidad dicha por el usuario. **Una ampliación o un cambio de una historia anterior es una historia NUEVA** con su propio número y `amplia: HU-nn` en el encabezado. Si es una HU nueva, redáctala: «Como…, quiero…, para…», reglas `RN`, pantallas `PA`, rutas, criterios **Dado/Cuando/Entonces** y un **«Listo cuando…»** (el escenario de punta a punta que la da por terminada).
2. Busca qué reglas `RN` (03), decisiones `DP` (09), mensajes (07) y pantallas (06) toca. **Si algo contradice una regla o decisión escrita** (ejemplo: RN-13 decía «la API no expone el stock»), eso no se resuelve en silencio: pregunta con opciones y una recomendada (primera) y espera.
3. Si no es una historia (arquitectura, rendimiento, seguridad, accesibilidad, despliegue), es un **habilitador `EN-nn`**: pon en `ligado:` del encabezado (el comprobador lo exige y verifica que exista) la `RN`, la `DP` o el requisito de `docs/product/08-requisitos-de-experiencia.md` que lo justifica o respalda. Una reorganización del código que no cambia el comportamiento se desglosa como una tarea de tipo `refactor` (receta en la plantilla).
4. Explora el código con subagentes de solo lectura si hace falta (qué existe ya, qué patrón copiar), sin modificar nada.

## 2. Repartir en tareas

Cada criterio se reparte en capas. **Una tarea toca una sola capa:**

| Capa | Qué es | Cierra con |
|---|---|---|
| `[DOC]` | Producto y guías sin código: HU, `RN`, `DP`, mensajes, pantallas | Los documentos coherentes (un `grep` de lo que se reemplaza, sin restos) |
| `[API]` | Backend: dominio, aplicación, rutas, OpenAPI, `api-contrato.md` | Compuerta del backend; **mutaciones** si es dominio, seguridad, dinero, concurrencia o restricciones de la base |
| `[WEB]` | Tienda; la primera `[WEB]` de la HU lleva `/cambio-de-contrato` si el contrato cambió | Compuerta de la tienda (`vp check`, `vp test`, build) |
| `[E2E]` | El «Listo cuando…» ejecutado con Playwright contra el backend real (`test/e2e/`) | `pnpm run test:e2e` (también contra el build de producción) y `test:perf` si toca rendimiento |

Reglas del desglose:
- **Orden:** `[DOC]` → `[API]` → `[WEB]` → `[E2E]`, y cada tarea dice **de cuál depende**. Lo que no depende de nada anterior puede ir antes.
- **Una tarea nunca deja la compuerta en rojo.** Un cambio de contrato es primero **aditivo** (se añade el campo nuevo; la tienda pasa a usarlo); quitar o renombrar lo viejo es otra tarea posterior.
- **Si al implementar aparece trabajo de otra capa**, no se mezcla: es una tarea nueva con su dependencia y se avisa.
- **Tipo y rigor de cada tarea** (columnas «Tipo» y «Rigor», justo después de la capa; **las dos se escriben en todas las filas**). **Se elige por lo que cambia**, no por cómo se programa, y se escribe exacto en **kebab-case** (minúsculas, sin acentos ni símbolos, con guiones en vez de espacios). **La tabla de tipos —qué cambia cada uno, ejemplos, si es «siempre critico» y su receta— está en `docs/historias/_plantilla.md`: léela antes de tipar las tareas** (o `python3 scripts/historias.py --tipos`). Resumen: `[API]`: `contrato` (lo que la API le ofrece a la tienda: un endpoint, **un campo más en una respuesta**, un error), `regla` (cómo decide el negocio), `evento`, `base-de-datos`, `configuracion`; `[WEB]`: `pantalla` (lo que se ve), `comportamiento` (lo que la tienda hace sin cambiar lo que se ve); `[DOC]`: `producto`, `guia`; `[E2E]`: `recorrido`.

  **Rigor:** `critico` marca una tarea **crítica** (mutaciones obligatorias y plan corto antes de codificar) y `normal` es el resto; se escribe en **todas** las filas, en minúsculas y sin acento. Solo `[API]` puede ser `critico`. Se marca `critico` cuando la tarea toca dinero y precios, seguridad (tokens, contraseñas, guards, roles, CORS, límites), concurrencia y transacciones (outbox, reservas, idempotencia), restricciones de la base o reglas del dominio críticas; `base-de-datos` y `evento` siempre lo son (el comprobador lo exige). **Un endpoint nuevo con lógica nueva son dos tareas** (la `regla` y el `contrato`); si una tarea mezcla tipos, elige el que decide la receta y el rigor, o pártela.
- **Iconos y formato de la tabla:** **Capa, Tipo, Rigor y Estado se escriben «icono texto»** (`⚙️ API`, `📜 contrato`, `🔴 critico`, `⏳ pendiente`), con el icono fijo de cada valor y en **todas** las filas; el texto es el valor (kebab-case). No hace falta memorizar los iconos: escribe solo el texto y ejecuta `python3 scripts/historias.py --formato`, que los completa. Estados de tarea: `propuesta`, `pendiente`, `en-curso`, `hecho`, `bloqueado` (al desglosar, todas `propuesta`).
- **La tabla es el índice y el detalle va en bloques.** La tabla tiene las columnas `# | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado`; **Objetivo** es el resultado que se busca en una frase («¿para qué existe esta tarea?», no «cómo se programa»). El detalle vive en «## Detalle de las tareas»: un bloque `### HU-nn.k Título` por tarea con **«Se comprueba»** como **lista de casillas** `- [ ]` (cada una concreta y verificable) y, si el rigor es `critico`, **«Reglas e invariantes»** (lo que nunca debe dejar de cumplirse). Las celdas de la tabla no pueden llevar `|`.
- **Lista para ejecutar:** una tarea está lista cuando su primera comprobación basta para escribir la primera prueba roja. El detalle mínimo depende de la tarea:

  | Tarea | Detalle antes de ejecutarla |
  |---|---|
  | `[DOC]` y `[WEB]` simples | un bloque con comprobaciones concretas |
  | `[WEB]` que cambia lo que se ve | + la sección **«## Pantalla»** de la HU, aprobada con ella; se revisa en un navegador real a 360 y 1280 px |
  | `[API]` que cambia la API | + la sección **«## Contrato»** de la HU, aprobada con ella |
  | `[API]` con rigor `critico` (dominio, seguridad, dinero, concurrencia, migración, evento) | + reglas e invariantes; el plan corto lo hace `/tarea` antes de codificar |
  | `[E2E]` | el escenario paso a paso |

- **El contrato va por adelantado; el plan de implementación, no.** La HU no lista archivos ni clases (se desactualizan): eso se decide justo antes de cada tarea, con `/tarea`. Lo que sí condiciona va en «Notas de diseño (orientativas, no vinculantes)».
- **Diagramas Mermaid, opcionales y por necesidad** (no se exigen ni se rellenan por rellenar): **secuencia** para el orden de una conversación entre piezas o cómo falla algo (en «Contrato»); **estados** para qué estados tiene algo y cuándo cambia (en «Pantalla»); **flujo** para una decisión con ramas o las dependencias entre más de 5 tareas. Uno por idea, de unos 10 nodos como máximo, con los textos reales de la tienda y de la API (`Quedan 3`, `OUT_OF_STOCK`); no duplica el ejemplo JSON ni el croquis, que siguen siendo la fuente de verdad; si cambia el contrato o la pantalla, se actualiza en la misma tarea. Si la historia es simple y una tabla basta, no lleva diagrama.
- Cada tarea lleva su **Objetivo** y su bloque con **«Se comprueba»** concreto (qué prueba falla primero, qué número o comportamiento se espera), no «implementar X».
- Las pruebas del propio cambio van **dentro** de la tarea (pruebas primero); no se hacen tareas «escribir tests» aparte. La `[E2E]` es solo el recorrido de punta a punta.
- Numeración `HU-nn.k` (o `EN-nn.k`), sin reutilizar números. Prefijo de commit: `HU-12.3 [API]: Mensaje en inglés`.

## 3. Dejarlo en el tablero

Crea `docs/historias/fase-n/HU-nn.md` desde la plantilla (en la carpeta de la fase en que se trabajará; si el usuario no la dijo, **pregunta** cuál, con una recomendada; el nombre es solo el id, sin título; `estado: propuesta`). Una fase nueva necesita su carpeta con un `README.md` que la describa (qué entra y qué queda fuera). Los enlaces del archivo van con `../../` (`../../product/…`):
- El encabezado, la historia, sus criterios, su «Listo cuando», la sección **«## Pantalla»** (obligatoria si hay tareas `[WEB]`: **dónde** va lo que cambia, un croquis en texto si una frase no basta, los **estados**, los **textos exactos** de `product/07`, qué cambia entre móvil y escritorio y la accesibilidad; reutiliza `product/diseno/`; una pantalla nueva o un componente grande va antes en una tarea `[DOC]` que actualiza el wireframe y el mockup; o «Sin cambios visuales»; el comprobador la exige), la sección **«## Contrato»** (obligatoria si hay tareas `[API]`: rutas y métodos, cuerpo, ejemplo JSON de la respuesta, errores nuevos, compatibilidad y qué no cambia; o «Sin cambios en el contrato»; el comprobador la exige), la tabla de tareas (`# | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado`, todas `propuesta`; el comprobador valida los iconos, que el tipo sea de la capa, que el rigor sea `critico` o `normal`, que `base-de-datos` y `evento` sean `critico` y que haya objetivo) y el **bloque de detalle de cada tarea** con sus casillas (y «Reglas e invariantes» en las críticas).
- La sección **«## Impacto en el producto»** (obligatoria): la tabla `Documento | Qué cambia | Acción | Estado` con las reglas `RN`, decisiones `DP`, pantallas `PA`, textos, visión y `api-contrato.md` que la historia toca (cita el id, o la ruta relativa a `docs/`; acción `agrega`, `modifica` o `retira`; estado `pendiente`), o «Sin impacto en el producto». Los documentos vivos dicen siempre lo vigente y la historia es el rastro: la **primera tarea `[DOC]`** los reescribe antes del código. Si `python3 scripts/historias.py` avisa de que otra historia abierta cambia lo mismo, **pregunta** al usuario el orden (o si se fusionan); si la historia deja sin efecto a otra, pon su id en `reemplaza:`.
- Su bitácora con una fila («desglosada, pendiente de aprobación»).
- La sección **«## Ejecución»** (inicio, fin y tiempo de cada tarea) la crea `python3 scripts/historias.py` con una fila por tarea y todo en «—»; nadie la escribe a mano.
- Ejecuta `python3 scripts/historias.py`: agrega la fila a la matriz y comprueba que el archivo está bien formado.
- **No toques** `product/04` (histórico), `RN`, `DP` ni el código todavía: eso lo hace la tarea `[DOC]` cuando el usuario apruebe.

## 4. Pedir la aprobación

Termina mostrando el desglose resumido (tabla de tareas con capa y dependencia) y **espera la aprobación del usuario** (si hay decisiones abiertas, con opciones y una recomendada). Al aprobar, `estado: aprobada` en el encabezado, las tareas pasan de 📝 a ⬜ y se ejecutan con `/tarea`.
