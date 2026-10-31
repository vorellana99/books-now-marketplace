---
name: tarea
description: Ejecutar una tarea de una historia de usuario (HU-nn.k, EN-nn.k) de su archivo en docs/historias/, de principio a fin, con el flujo y las reglas del proyecto. Úsalo al empezar cualquier tarea de implementación ya aprobada, o cuando se pida "continúa con la siguiente tarea". Si lo pedido todavía no es una tarea aprobada del tablero, usa /hu primero.
---

# Ejecutar una tarea

Guía completa para personas: `docs/guia-de-desarrollo.md` (§4.2). Las herramientas, con ejemplos: `docs/herramientas-de-trabajo.md`. El trabajo se organiza **por historia de usuario**: cada historia nueva es un archivo en `docs/historias/` (con sus tareas y su bitácora) y la matriz de todas está en `docs/historias/README.md`. Lo pendiente sin desglosar son ideas de esa misma matriz (`estado: idea`). `docs/avance.md` y los tableros `docs/backend/00-avance.md` y `docs/frontend/00-avance.md` son **historial congelado**: no se les añade nada.

## 0. ¿Es una tarea aprobada?

- Una tarea es una fila del archivo de su historia (`docs/historias/fase-n/HU-nn.md`) con estado ⬜ (aprobada), no 📝 (propuesta). Si el usuario pide algo que **no está** como tarea aprobada («quiero que…»), **no empieces a programar**: usa `/hu` para redactar la historia y desglosarla, y espera su aprobación.
- «Continúa con la siguiente tarea» = la primera tarea ⬜ cuyas dependencias estén todas ✅. «Haz toda la HU-nn» = encadenar sus tareas en orden, sin informar entre una y otra; el informe va una vez, al final.
- **Al empezar la tarea:** pasa su Estado a `⏩ en-curso` y ejecuta `python3 scripts/historias.py`: sella el **inicio** en la tabla «## Ejecución» de la HU (hora de Lima). Hazlo antes de escribir nada.
- Comprueba las **dependencias**: no empieces una tarea cuya dependencia no esté ✅.
- Comprueba que está **lista para ejecutarse** (ver `/hu`): si puedes escribir su primera prueba roja con su primera comprobación (y, en una `[API]` que cambia la API, la sección «Contrato» de la HU; en una `[WEB]` que cambia lo que se ve, la sección «Pantalla»). Si no, no empieces: completa el detalle con el usuario.

## 1. Entender qué se pide y de dónde sale cada dato

| Pregunta | Fuente de verdad |
|---|---|
| ¿Qué tarea toca, de qué capa y qué se comprueba? | La fila de la tarea (capa, tipo, rigor, **objetivo**, «Depende de») y su **bloque de detalle** (`### HU-nn.k …`: «Se comprueba» con sus casillas y, si es crítica, «Reglas e invariantes») en `docs/historias/HU-nn-….md` |
| ¿Qué debe hacer el producto? | `docs/product/`: reglas `RN-nn` (03), historias `HU-nn` (04), decisiones `DP-nn` (09), mensajes (07) |
| ¿Cuál es el contrato HTTP? | `docs/api-contrato.md` y `/docs-json`. **Si discrepan, gana el código** y se corrige el documento en el mismo commit |
| ¿Cómo está construido y por qué? | `CLAUDE.md`, `docs/backend/05-piezas-clave.md`, «Decisiones y desvíos» del archivo de la historia y el porqué de cada regla en `docs/historias/README.md` (lo anterior, en `docs/avance.md` y los `00-avance.md` congelados) |
| ¿Hay algo abierto o por decidir? | las ideas de la matriz de `docs/historias/README.md` (`estado: idea`), la «Decisiones y desvíos» del archivo de la historia y `docs/product/09-decisiones-y-preguntas.md` |
| ¿Cómo se prueba? | `docs/backend/06-tests.md` (técnicas y trampas aprendidas) y `docs/frontend/06-tests.md` |

Lee la fila de la tarea, **su bloque de detalle** y las reglas que cita antes de escribir nada. Si algo no está decidido, **pregunta** (ver «Cuándo preguntar»).

## 2. El ciclo

1. **Rama.** Se trabaja en `feature/mvp` (o la rama que indique el usuario). No se abren PR ni se sube nada sin que lo pida.
2. **Una tarea, una capa.** La sección **«Pantalla»** de la HU (si la tarea es `[WEB]` y cambia lo que se ve) también está aprobada y manda: ubicación, textos, estados y tonos tal cual; si hay que apartarse, detente y pregunta. El **contrato** de la sección «Contrato» de la HU (si la tarea es `[API]`) está aprobado y manda: se cumple tal cual, y si al implementar hay que cambiarlo (otro nombre, otro código de error, otra forma), **detente y vuelve a pedir aprobación**, no lo decidas al programar. Solo se toca la capa de la tarea (`[API]` → `apps/main-api`; `[WEB]` → `apps/store-web`; `[E2E]` → `apps/store-web/test/e2e`; `[DOC]` → documentos). Si aparece trabajo de otra capa, **no se mezcla**: se añade como tarea nueva a la HU (con su dependencia) y se avisa al usuario.
3. **Receta y plan corto.** La columna **Tipo** de la fila dice qué receta cargar; **la receta de cada tipo está en `docs/historias/_plantilla.md`** («Receta por tipo»; o `python3 scripts/historias.py --tipos`): por ejemplo `contrato` → `/nueva-ruta` si es un endpoint nuevo, `evento` → `/nuevo-evento`, `base-de-datos` → `/nueva-migracion`. **Plan corto antes de codificar** (solo las tareas con rigor **`critico`** —críticas: dominio, seguridad, dinero, concurrencia, migración, evento— o las grandes, de varios archivos): entra en el modo de planificación, explora el código con subagentes de solo lectura y muestra al usuario un plan breve (qué archivos y clases, qué patrón se copia, qué pruebas y qué mutaciones). **No se guarda en un archivo**: se aprueba y se ejecuta; lo que se aprenda va a «Decisiones y desvíos» de la HU. Las tareas simples no lo necesitan.
4. **Pruebas primero** y verlas fallar (un error de compilación por lo que aún no existe también cuenta). Las expectativas salen de las casillas de «Se comprueba» de su bloque. En `[DOC]` el equivalente es un `grep` de lo que se reemplaza y una prueba de documentación si existe (`docs-conventions.spec.ts`, `deploy-docs.test.ts`).
5. **Implementar** lo mínimo que las haga pasar. Leer el código vecino y seguir su estilo, comentarios y nombres. En la primera `[WEB]` de una HU cuyo contrato cambió: `/cambio-de-contrato`.
6. **Revisión visual** (solo `[WEB]` que cambia lo que se ve): abre la tienda en un navegador real (Playwright, con la API y el seed) a **360 y 1280 px**, compara con la sección «Pantalla», mira la captura y anota en la bitácora qué revisaste y qué ajustaste. No se usan pruebas de captura píxel a píxel (se rompen con cualquier cambio de contenido); el contraste y los objetivos táctiles los cubre axe en la `[E2E]`.
7. **Compuerta:** `scripts/verify.sh` (detecta sola la capa tocada) o `pnpm run verify` en la app. Se detiene en el primer fallo. Hay que leer los conteos de Vitest: *skipped* o un resumen ausente no es un verde. Una tarea **nunca** deja la compuerta en rojo. Las `[E2E]` no están en la compuerta: se ejecutan (`pnpm run test:e2e`, también con `E2E_PRODUCTION_BUILD=1` contra el build de producción) y se anotan sus conteos.
8. **Mutaciones** si la tarea tiene rigor **`critico`** (ver `/mutar`). Cada superviviente se cubre con una prueba, se simplifica el código o se documenta como equivalente.
9. **Documentar en el mismo commit**. Si la tarea `[DOC]` escribe documentos vivos del producto (`RN`, `DP`, `PA`, contenido, `api-contrato.md`…), **reescribe lo vigente** (no añadas «ahora además…»), deja en la línea de cada regla, decisión o pantalla la marca `Cambios: HU-nn (AAAA-MM-DD)` y pasa su fila de «Impacto en el producto» a `hecho` (una decisión reemplazada queda «reemplazada por DP-nn», una regla retirada «Retirada»; el comprobador lo verifica y `python3 scripts/historias.py` regenera `docs/product/cambios.md`). Además, en los tres sitios del archivo de la HU: **las casillas** del bloque de la tarea (`- [x]`, todas), el **Estado** de su fila (`⏩ en-curso` → `✅ hecho`; `python3 scripts/historias.py --formato` completa los iconos) y una fila de la bitácora con los **conteos reales** copiados de la salida (nunca de memoria); y «Decisiones y desvíos» si algo se apartó del plan. Si cambió el contrato: `docs/api-contrato.md`.
10. **Un commit por tarea**, `HU-nn.k [CAPA]: Mensaje en inglés` (`EN-nn.k [CAPA]: …` en un habilitador): la capa es la de la tarea, el mensaje va **en inglés y en imperativo** («Add…»), el asunto completo de **72 caracteres como máximo** y una sola tarea por commit; el hook `.githooks/commit-msg` lo rechaza si no cumple (si el hook no está activo en el clon: `git config core.hooksPath .githooks`). Con la línea `Co-Authored-By:` del entorno. Encadenar la compuerta, el cierre de documentos y el commit en **una sola cadena** (`&&`): un fallo no debe dejar un commit sin documentos ni con la compuerta en rojo.
11. **Regenerar la matriz** con `python3 scripts/historias.py` (**sella el fin y el tiempo** de la tarea en «## Ejecución» —con el Estado ya en `✅ hecho`—, actualiza la matriz y comprueba que el archivo está bien formado) y añade `docs/historias/README.md` al commit. **Cerrar la HU** cuando la tarea hecha es la última y su `[E2E]` ejecutó el «Listo cuando…»: `estado: cerrada` en el encabezado (la matriz toma de `git log` la fecha de cierre y el tiempo). El script no deja cerrar una HU sin `[E2E]` ni con tareas pendientes. Una HU con tareas hechas pero sin su `[E2E]` **no está cerrada**.

## 3. Cuánto rigor: pruebas siempre; mutaciones en lo crítico

- **Pruebas primero: siempre.**
- **Mutaciones obligatorias** en las tareas con rigor **`critico`** (el desglose lo marca cuando tocan): dominio (`src/contexts/*/domain`), seguridad (tokens, contraseñas, guards, roles, CORS, límite de intentos), dinero y precios, concurrencia y transacciones (outbox, reservas, idempotencia) y restricciones de la base.
- **Opcionales** en: DTO de solo forma, documentación de Swagger, texto, cableado trivial.
- `[WEB]`: compuerta (`vp check`, `vp test`, build). Las mutaciones automáticas son solo del backend.

## 4. Cuándo preguntar al usuario

Una decisión que cambia lo que se construye y no está en los documentos: **plantea opciones con una recomendada (primera) y espera la respuesta** antes de aplicar. No preguntes lo que tenga un valor por defecto convencional ni lo que se pueda verificar en el código. Si el usuario ya decidió, no lo vuelvas a discutir. Una decisión de producto que la HU contradice (`RN`/`DP`) se resuelve en la tarea `[DOC]`, antes del código.

## 5. Trampas aprendidas (cada una costó tiempo)

- **Prettier reformula el código:** las anclas de mutación se copian del archivo ya formateado.
- **Lanzar una mutación con la configuración equivocada** hace que no incluya sus pruebas y «sobreviva»: `scripts/mutate.py` la elige solo.
- **Un cambio transversal rompe pruebas lejanas** (el guard global rompió los e2e de pedidos): tras tocarlo, corre toda la suite, no solo el archivo.
- **Una prueba de concurrencia que pasa sin el bloqueo no prueba nada:** ensancha la ventana (`slowDown…Updates` en `test/support/database.ts`).
- **Un helper con parámetro por defecto convierte `undefined` en un valor válido.**
- **Fechas:** `node-pg` serializa un `Date` en hora local; en los tests, texto ISO. No afirmes umbrales de tiempo; congela solo `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`).
- **No sobrescribas un archivo de pruebas que ya existe:** comprueba con `ls`/`git status` antes de crear (el total de pruebas que baja es la señal).
- **Procesos:** mátalos por PID. `pkill -f`/`pgrep -f` se coinciden a sí mismos y matan tu propia shell. En zsh una variable con varias palabras no se divide.
- **Una prueba e2e o de rendimiento que pasa no prueba nada hasta que se ve fallar:** rompe el código a propósito (una clave de idempotencia nueva, quitar la precarga de rutas) y comprueba que la prueba lo nota. Un servidor de vista previa que sobrevivió a una ejecución anterior puede servir un build viejo y hacer pasar la mutación: mata por PID y no reutilices el servidor (`reuseExistingServer: false`).
- **El límite de intentos de la API (`/auth/*`) también corre en las e2e:** cada prueba crea su comprador y planta su token de refresco una sola vez (se rota al usarse); los ayudantes esperan el `Retry-After` de un `429`.
- **Un fallo «suelto» de una prueba se investiga, no se descarta:** la compuerta guarda el detalle en `.verify-last-failure.txt`; la causa de los de la tienda era un tiempo de espera de 1 s que no alcanzaba con la máquina cargada.
- **Archivos temporales** en `$CLAUDE_JOB_DIR/tmp`, no en `/tmp`. No lances la compuerta mientras corre otra cosa pesada (comparten Docker y CPU).

## 6. Al terminar

Informa lo que se hizo, dónde vive, los conteos reales, **los errores propios** y lo que quedó abierto. No digas «verificado» de lo que solo se leyó.
