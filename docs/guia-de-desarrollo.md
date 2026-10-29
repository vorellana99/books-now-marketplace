# Guía de desarrollo

> Cómo se trabaja en este repositorio: de dónde sale cada dato, cuál es el ciclo de una tarea, cuánto rigor se exige y qué hacer cuando algo sale mal. Está pensada para una persona que trabaja con Claude Code; lo que Claude ejecuta (comandos y scripts) se explica, con ejemplos, en [herramientas-de-trabajo](herramientas-de-trabajo.md).

## 1. El repositorio en un vistazo

```
apps/main-api     API (NestJS 12 + Prisma 7 + PostgreSQL 18). Aquí está casi todo el trabajo
apps/store-web    Tienda web (React 19 + TanStack + Tailwind 4, sobre Vite+; comando `vp`)
docs/backend      Guía y avance del backend por cortes (00-avance.md es el tablero)
docs/frontend     Guía y avance de la tienda por cortes F0–F6
docs/product      El producto: reglas RN, historias HU, decisiones DP, pantallas PA, diseño
docs/api-contrato.md   Lo que la API promete (rutas, respuestas, errores). Lo consume la tienda
scripts/          La compuerta (verify.sh) y las pruebas de mutación (mutate.py)
.claude/skills/   Comandos de Claude: /tarea, /mutar, /nueva-ruta…
CLAUDE.md         Resumen para Claude: arquitectura, comandos y reglas
```

El trabajo se organiza en **cortes** y cada corte en **tareas**. En el backend, `N.M` es la tarea M del corte N (`7.6`); en la tienda, `FN.M` (`F4.6`). Cada tarea es **un commit** con ese prefijo (`7.6: Add the default-deny auth guard…`).

## 2. Primer arranque

Requisitos: Node 24 (≥ 24.15), pnpm 12.15, Docker (la base de desarrollo y los e2e). PostgreSQL tiene que ser la 18: el Outbox usa `uuidv7()`.

```bash
# Backend
cd apps/main-api
pnpm install
cp .env.example .env               # DB_PORT=5433 coincide con docker-compose
pnpm run db:up                     # PostgreSQL 18
pnpm exec prisma migrate dev       # tablas y cliente de Prisma
pnpm run db:seed                   # opcional: usuarios, libros y stock de ejemplo
pnpm run start:dev                 # http://localhost:3000, Swagger en /docs

# Tienda (otra terminal)
cd apps/store-web
vp install
cp .env.example .env
vp dev                             # http://localhost:5173; reenvía /api al backend
```

Comprueba el backend en <http://localhost:3000/health/ready>. Con el seed hay tres usuarios, todos con la contraseña `LibroYa-dev-2026`: `ana@example.com`, `luis@example.com` (premium) y `admin@example.com`. Detalles: [README del backend](../apps/main-api/README.md) y [02 de la tienda](frontend/02-estructura-y-puesta-en-marcha.md).

## 3. De dónde sale cada dato

Cada pregunta tiene **una** fuente de verdad. Si un documento contradice al código, **gana el código** y el documento se corrige en el mismo commit.

| Pregunta | Fuente |
|---|---|
| ¿Qué tarea toca y qué se comprueba? | La fila y la casilla de la tarea en [`backend/00-avance.md`](backend/00-avance.md) o [`frontend/00-avance.md`](frontend/00-avance.md), con sus enlaces de «Guía» |
| ¿Qué debe hacer el producto? | [`product/`](product/README.md): reglas `RN-nn` (03), historias `HU-nn` (04), decisiones `DP-nn` (09), pantallas `PA-nn` (06) |
| ¿Cuál es el contrato HTTP? | [`api-contrato.md`](api-contrato.md) y, ejecutándose, `/docs-json` |
| ¿Cómo está construido y por qué? | [`CLAUDE.md`](../CLAUDE.md), [`backend/05-piezas-clave.md`](backend/05-piezas-clave.md) y la tabla «Decisiones y desvíos» de `00-avance.md` (lo que se apartó de la guía) |
| ¿Cómo se prueba? | [`backend/06-tests.md`](backend/06-tests.md) y [`frontend/06-tests.md`](frontend/06-tests.md) |
| ¿Qué está abierto o por decidir? | «Problemas abiertos» de `00-avance.md` y [`product/09-decisiones-y-preguntas.md`](product/09-decisiones-y-preguntas.md) |
| ¿Qué datos hay para probar a mano? | «Datos de ejemplo» del README del backend (seed) |

## 4. El ciclo de una tarea

Siete pasos, en este orden. El ejemplo es la tarea real **7.8** (`GET /me/orders`).

| # | Paso | En la 7.8 |
|---|---|---|
| 1 | **Leer** la fila de la tarea, su «Se comprueba» y las reglas que cita | «cada comprador ve solo lo suyo, el administrador ve el de cualquier cliente, la paginación sigue igual»; reglas RN-36, RN-40 y DP-18 |
| 2 | **Pruebas primero** y verlas fallar | `test/e2e/my-orders.e2e.spec.ts` (14 pruebas) falla porque la ruta no existe |
| 3 | **Implementar** lo mínimo, con el estilo del código vecino | `my-orders.controller.ts`, `admin-order.controller.ts`, `list-orders.dto.ts` |
| 4 | **Compuerta**: `scripts/verify.sh` | tipos, lint, formato, build, 1120 unitarias y 902 de integración y e2e |
| 5 | **Mutaciones** si el código es crítico | 15 cambios deliberados, todos detectados |
| 6 | **Documentos** en el mismo commit | casilla, fila del cuadro de tareas, «Decisiones y desvíos», bitácora con los conteos reales y `api-contrato.md` |
| 7 | **Un commit** con prefijo `N.M:` | `7.8: Add GET /me/orders and move the admin history to /admin/orders` |

Reglas del ciclo:

- **Se detiene en el primer fallo.** Nunca se hace el commit con la compuerta en rojo.
- **Los números de la documentación salen de la última ejecución**, copiados de la salida. Nunca de memoria (se corrigieron varias cifras así en el corte 7).
- **Los documentos se marcan en los tres sitios** de `00-avance.md`: la casilla de la lista, la fila del cuadro de tareas (⬜ → ✅) y la bitácora.
- **Si se pide un corte entero**, se encadenan sus tareas sin detenerse a informar entre una y otra; el informe va una vez, al final.
- **Ramas:** una sola rama de trabajo para varios cortes (hoy `feature/mvp`). **No se abren pull requests ni se sube nada** sin que lo pida quien manda el proyecto.

## 5. Cuánto rigor

| | Qué se exige |
|---|---|
| **Pruebas primero** | Siempre, en toda tarea |
| **Compuerta** | Siempre, antes de cada commit |
| **Mutaciones** | **Obligatorias** en dominio, seguridad (tokens, contraseñas, guards, roles, CORS, límites), dinero y precios, concurrencia y transacciones (outbox, reservas, idempotencia) y restricciones de la base. **Opcionales** en DTO de solo forma, documentación de Swagger, textos y cableado trivial |
| **Frontend** | Compuerta (`vp check`, `vp test`, build). Las mutaciones automáticas son solo del backend |

Una prueba que no puede fallar no protege nada. Por eso, para el código crítico, se rompe a propósito y se mira si alguna prueba lo nota ([mutar](herramientas-de-trabajo.md#3-pruebas-de-mutación-scriptsmutatepy)).

## 6. Recetas: qué comando usar

| Quiero… | Comando de Claude | Se explica en |
|---|---|---|
| Hacer una tarea de un corte, de principio a fin | `/tarea` | [herramientas §4.1](herramientas-de-trabajo.md#41-tarea) |
| Probar que las pruebas detectan errores | `/mutar` | [§4.2](herramientas-de-trabajo.md#42-mutar) |
| Añadir un endpoint | `/nueva-ruta` | [§4.3](herramientas-de-trabajo.md#43-nueva-ruta) |
| Añadir una variable de entorno | `/nueva-variable-entorno` | [§4.4](herramientas-de-trabajo.md#44-nueva-variable-entorno) |
| Cambiar la base de datos | `/nueva-migracion` | [§4.5](herramientas-de-trabajo.md#45-nueva-migracion) |
| Que un contexto reaccione a otro | `/nuevo-evento` | [§4.6](herramientas-de-trabajo.md#46-nuevo-evento) |
| Llevar un cambio de la API a la tienda | `/cambio-de-contrato` | [§4.7](herramientas-de-trabajo.md#47-cambio-de-contrato) |
| Verificar todo antes de un commit | `scripts/verify.sh` | [§2](herramientas-de-trabajo.md#2-la-compuerta-scriptsverifysh) |

## 7. Backend y tienda: el contrato

El contrato es el OpenAPI que publica el backend (`/docs-json`). La tienda lo convierte en tipos (`apps/store-web/src/shared/api/schema.d.ts`, que **se sube a git**) y **solo** importa de `shared/api/types.ts`, nunca del archivo generado.

- **Un cambio de la API** se hace primero en el backend (código, pruebas, compuerta y `api-contrato.md`) y después se propaga a la tienda con `/cambio-de-contrato`: regenerar `schema.d.ts` con el backend real levantado, ajustar los alias, `vp check` y `vp test`, y actualizar los documentos.
- **Una decisión de producto que el cambio contradice** (`DP-nn`) no se resuelve en silencio: se pregunta. Ejemplo real: `DP-15` esperaba la dirección en `GET /orders/:id` y el backend cerró el corte 7 sin ella; se preguntó, se eligió añadirla y se documentó en producto, contrato y frontend.
- **La tienda nunca calcula montos**: muestra los textos que devuelve la API (RN-08).

## 8. Trampas que ya costaron tiempo

| Trampa | Qué hacer |
|---|---|
| Prettier reformula el código y las anclas de mutación dejan de coincidir | Copiar el ancla del archivo ya formateado |
| Un cambio transversal rompe pruebas lejanas (el guard global rompió los e2e de pedidos) | Tras tocarlo, correr toda la suite, no solo el archivo |
| Una prueba de concurrencia que pasa sin el bloqueo no prueba nada | Ensanchar la ventana (`slowDown…Updates` en `test/support/database.ts`) |
| Un token «forjado» sin un campo se rechaza por esa razón y no por la que se prueba | Forjar con todo válido salvo lo que se quiere probar |
| Un helper con parámetro por defecto convierte `undefined` en un valor válido | No dar valor por defecto a lo que se prueba como ausente |
| `Date` de `node-pg` sale en hora local | Escribir fechas como texto ISO; no afirmar umbrales de tiempo; congelar solo `Date` |
| Se sobrescribió un archivo de pruebas que ya existía | Comprobar con `ls` o `git status` antes de crear; un total de pruebas que baja es la señal |
| `pkill -f` y `pgrep -f` se coinciden a sí mismos y matan la propia shell | Matar por PID |
| Una mutación lanzada con la configuración equivocada «sobrevive» | Dejar que `scripts/mutate.py` la elija |
| «Skipped» o un resumen ausente de Vitest parecen un verde | Leer los conteos: un arranque roto omite las pruebas |
| Archivos temporales en `/tmp` chocan con otras sesiones | Usar `$CLAUDE_JOB_DIR/tmp` |

La lista completa, con más detalle, está en el comando `/tarea`.

## 9. Cuándo preguntar y qué no hacer

- **Se pregunta** cuando hay una decisión que cambia lo que se construye y no está en los documentos: se plantean **opciones con una recomendada (la primera)** y se espera la respuesta antes de aplicar. Una vez decidido, no se reabre.
- **No se pregunta** lo que tiene un valor por defecto convencional ni lo que se puede comprobar en el código.
- **No se hace sin pedirlo:** abrir pull requests, subir ramas, cambiar el CI, tocar la base de desarrollo de quien trabaja, ni borrar archivos que no se han mirado.
- **Se informa con honestidad:** los conteos reales, los errores propios y lo que quedó abierto. «Verificado» solo se dice de lo que se ejecutó, no de lo que se leyó.

## 10. Trabajar con Claude: frases que funcionan

| Quiero… | Digo… |
|---|---|
| Continuar el trabajo | «continúa con la siguiente tarea» (Claude usa `/tarea`) |
| Un corte entero, sin interrupciones | «haz todo el corte 8» |
| Una tarea concreta | «`/tarea 8.1`» |
| Solo un plan, sin implementar | «solo la planificación por ahora» |
| Decidir yo antes de que se aplique | «dame opciones con una recomendada» |
| Revisar lo hecho | «¿qué queda pendiente?» (Claude lee «Problemas abiertos») |
| Propagar un cambio a la tienda | «`/cambio-de-contrato`» |

## 11. Glosario de siglas

| Sigla | Significa | Dónde |
|---|---|---|
| **N.M** | Tarea M del corte N del backend (`7.6`) | `backend/00-avance.md` |
| **FN.M** | Tarea M del corte N de la tienda (`F4.6`) | `frontend/00-avance.md` |
| **RN-nn** | Regla de negocio | `product/03-reglas-de-negocio.md` |
| **HU-nn** | Historia de usuario | `product/04-historias-de-usuario.md` |
| **PA-nn** | Pantalla | `product/06-pantallas-y-navegacion.md` |
| **DP-nn** | Decisión de producto | `product/09-decisiones-y-preguntas.md` |
| **D1…D8** | Decisiones de diseño del corte 7 (sesión, contraseñas, alta, cliente…) | `backend/00-avance.md`, corte 7 |
| **Corte** | Un grupo de tareas con su «listo cuando» | los dos `00-avance.md` |
| **Compuerta** | La cadena de comprobaciones antes de un commit | `scripts/verify.sh` |
| **Mutación** | Un cambio deliberado del código para ver si las pruebas lo detectan | `scripts/mutate.py` |
