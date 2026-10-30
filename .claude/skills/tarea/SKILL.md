---
name: tarea
description: Implementar una tarea de un corte (backend 7.x/8.x o frontend F0–F6) de principio a fin, con el flujo y las reglas del proyecto. Úsalo al empezar cualquier tarea de implementación, o cuando se pida "continúa con la siguiente tarea".
---

# Implementar una tarea

Guía completa para personas: `docs/guia-de-desarrollo.md`. Las herramientas, con ejemplos: `docs/herramientas-de-trabajo.md`.

## 1. Entender qué se pide y de dónde sale cada dato

| Pregunta | Fuente de verdad |
|---|---|
| ¿Qué tarea toca y qué se comprueba? | La fila de la tarea y su casilla `- [ ] N.M …Se comprueba:…` en `docs/backend/00-avance.md` o `docs/frontend/00-avance.md`, con sus enlaces de «Guía» |
| ¿Qué debe hacer el producto? | `docs/product/`: reglas `RN-nn` (03), historias `HU-nn` (04), decisiones `DP-nn` (09) |
| ¿Cuál es el contrato HTTP? | `docs/api-contrato.md` y `/docs-json`. **Si discrepan, gana el código** y se corrige el documento en el mismo commit |
| ¿Cómo está construido y por qué? | `CLAUDE.md`, `docs/backend/05-piezas-clave.md`, y «Decisiones y desvíos» de `00-avance.md` (lo que se apartó de la guía) |
| ¿Hay algo abierto o por decidir? | «Problemas abiertos» de `00-avance.md` y `docs/product/09-decisiones-y-preguntas.md` |
| ¿Cómo se prueba? | `docs/backend/06-tests.md` (técnicas y trampas aprendidas) y `docs/frontend/06-tests.md` |

Lee la fila de la tarea **y** las reglas que cita antes de escribir nada. Si algo no está decidido, **pregunta** (ver «Cuándo preguntar»).

## 2. El ciclo

1. **Rama.** Se trabaja en `feature/mvp` (o la rama que indique el usuario). No se abren PR ni se sube nada sin que lo pida.
2. **Pruebas primero** y verlas fallar (un error de compilación por lo que aún no existe también cuenta). Las expectativas salen de la columna «Se comprueba».
3. **Implementar** lo mínimo que las haga pasar. Leer el código vecino y seguir su estilo, comentarios y nombres.
4. **Compuerta:** `scripts/verify.sh` (o `pnpm run verify` en la app). Se detiene en el primer fallo. Hay que leer los conteos de Vitest: *skipped* o un resumen ausente no es un verde.
5. **Mutaciones** si el código es crítico (ver `/mutar`). Cada superviviente se cubre con una prueba, se simplifica el código o se documenta como equivalente.
6. **Documentar en el mismo commit:** marcar la casilla, la fila del cuadro de tareas (⬜ → ✅), «Decisiones y desvíos» si algo se apartó del plan, y una fila en la bitácora con los **conteos reales** copiados de la salida (nunca de memoria). Si cambió el contrato: `docs/api-contrato.md`.
7. **Un commit por tarea**, `N.M: Mensaje en inglés`, con la línea `Co-Authored-By:` del entorno. Encadenar el script de documentación y el commit con `&&`: un fallo no debe dejar un commit sin documentos.

## 3. Cuánto rigor: pruebas siempre; mutaciones en lo crítico

- **Pruebas primero: siempre.**
- **Mutaciones obligatorias** en: dominio (`src/contexts/*/domain`), seguridad (tokens, contraseñas, guards, roles, CORS, límite de intentos), dinero y precios, concurrencia y transacciones (outbox, reservas, idempotencia) y restricciones de la base.
- **Opcionales** en: DTO de solo forma, documentación de Swagger, texto, cableado trivial.
- Frontend: compuerta (`vp check`, `vp test`, build). Las mutaciones automáticas son solo del backend.

## 4. Cuándo preguntar al usuario

Una decisión que cambia lo que se construye y no está en los documentos: **plantea opciones con una recomendada (primera) y espera la respuesta** antes de aplicar. No preguntes lo que tenga un valor por defecto convencional ni lo que se pueda verificar en el código. Si el usuario ya decidió, no lo vuelvas a discutir.

## 5. Trampas aprendidas (cada una costó tiempo)

- **Prettier reformula el código:** las anclas de mutación se copian del archivo ya formateado.
- **Lanzar una mutación con la configuración equivocada** hace que no incluya sus pruebas y «sobreviva»: `scripts/mutate.py` la elige solo.
- **Un cambio transversal rompe pruebas lejanas** (el guard global rompió los e2e de pedidos): tras tocarlo, corre toda la suite, no solo el archivo.
- **Una prueba de concurrencia que pasa sin el bloqueo no prueba nada:** ensancha la ventana (`slowDown…Updates` en `test/support/database.ts`).
- **Un helper con parámetro por defecto convierte `undefined` en un valor válido.**
- **Fechas:** `node-pg` serializa un `Date` en hora local; en los tests, texto ISO. No afirmes umbrales de tiempo; congela solo `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`).
- **No sobrescribas un archivo de pruebas que ya existe:** comprueba con `ls`/`git status` antes de crear (el total de pruebas que baja es la señal).
- **Procesos:** mátalos por PID. `pkill -f`/`pgrep -f` se coinciden a sí mismos y matan tu propia shell. En zsh una variable con varias palabras no se divide.
- **Archivos temporales** en `$CLAUDE_JOB_DIR/tmp`, no en `/tmp`. No lances la compuerta mientras corre otra cosa pesada (comparten Docker y CPU).

## 6. Al terminar

Informa lo que se hizo, dónde vive, los conteos reales, **los errores propios** y lo que quedó abierto. No digas «verificado» de lo que solo se leyó.
