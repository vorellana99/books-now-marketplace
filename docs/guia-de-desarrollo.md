# Guía de desarrollo

> Cómo se trabaja en este repositorio: cómo una historia de usuario se convierte en tareas, de dónde sale cada dato, cuál es el ciclo de una tarea, cuánto rigor se exige y qué hacer cuando algo sale mal. Está pensada para una persona que trabaja con Claude Code; lo que Claude ejecuta (comandos y scripts) se explica, con ejemplos, en [herramientas-de-trabajo](herramientas-de-trabajo.md).

## 1. El repositorio en un vistazo

```
apps/main-api     API (NestJS 12 + Prisma 7 + PostgreSQL 18). Aquí está casi todo el trabajo
apps/store-web    Tienda web (React 19 + TanStack + Tailwind 4, sobre Vite+; comando `vp`)
docs/historias/   LAS HISTORIAS: el índice de fases y las reglas (README.md) y, por fase, su objetivo, su matriz y un archivo por historia o habilitador nuevo, con sus tareas por capa y su bitácora
docs/avance.md    Historial congelado (lo transversal hasta el 2026-10-31); hoy lo pendiente son ideas en historias/
docs/backend      Guía del backend; su 00-avance.md (cortes 0–10) es historial congelado
docs/frontend     Guía de la tienda; su 00-avance.md (cortes F0–F6) es historial congelado
docs/product      El producto: reglas RN, historias HU, decisiones DP, pantallas PA, diseño
docs/api-contrato.md   Lo que la API promete (rutas, respuestas, errores). Lo consume la tienda
scripts/          La compuerta (verify.sh) y las pruebas de mutación (mutate.py)
.claude/skills/   Comandos de Claude: /tarea, /mutar, /nueva-ruta…
CLAUDE.md         Resumen para Claude: arquitectura, comandos y reglas
```

El trabajo se organiza **por historia de usuario (`HU-nn`)**. Una historia puede pedir cambios en el backend, en la tienda o en los dos; se desglosa en **tareas verticales**, cada una de **una sola capa** (`[API]`, `[WEB]`, `[E2E]` o `[DOC]`), y viven en el archivo de esa historia, dentro de [`historias/`](historias/README.md), donde está el índice de fases y, en cada fase, su matriz (la fase 1 reúne las 20 anteriores, como histórico). Una ampliación de una historia anterior es una historia nueva. La tarea `HU-12.3` es la tercera de la HU-12; cada tarea es **un commit** con ese prefijo y su capa (`HU-12.3 [API]: Add availability to GET /books`). Lo que no es una historia (arquitectura, rendimiento, seguridad, accesibilidad) es un **habilitador** `EN-nn`. Los cortes `N.M` y `FN.M` anteriores a 2026-10-30 son el historial y no se reutilizan.

## 2. Primer arranque

Requisitos: Node 24 (≥ 24.15), pnpm 12.15, Docker (la base de desarrollo y los e2e) y unas herramientas de línea de comandos, entre ellas **`jq`** (ver la tabla de [requisitos previos](#requisitos-previos)). PostgreSQL tiene que ser la 18: el Outbox usa `uuidv7()`.

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

### Requisitos previos

Instálalos **antes** de seguir: sin ellos, los ejemplos del README, la compuerta o las mutaciones fallan con un «command not found» poco claro. Comprobación rápida: `command -v git node pnpm vp docker curl jq uuidgen openssl python3`; todos deben imprimir una ruta.

| Herramienta | Versión | Para qué | Dónde se usa |
|---|---|---|---|
| Node.js | 24 (≥ 24.15) | Backend y tienda | Todo |
| pnpm | 12.15 | Dependencias y scripts de cada app | Todo |
| Vite+ (`vp`) | el de `apps/store-web` | `vp check`, `vp test`, `vp dev` | Tienda |
| Docker | cualquiera reciente, con el daemon activo | La base de desarrollo (PostgreSQL **18**) y los e2e con Testcontainers | `pnpm run db:up`, `test:e2e`, `scripts/verify.sh` |
| git | cualquiera | Commits por tarea; `verify.sh` mira lo que hay sin commitear | Todo |
| Python 3 | 3.12 (la probada; sin paquetes extra) | `scripts/mutate.py`, `scripts/test_mutate.py` | Mutaciones |
| `curl` | cualquiera | Los ejemplos del README del backend | Pruebas a mano |
| **`jq`** | cualquiera | Sacar `accessToken` y `refreshToken` de las respuestas en los ejemplos de autenticación y de administración del README | Pruebas a mano |
| `uuidgen` | paquete `uuid-runtime` | El `Idempotency-Key` de `POST /orders` en los ejemplos | Pruebas a mano |
| `openssl` | cualquiera | Generar `JWT_SECRET` (`openssl rand -base64 48`) | Configuración |
| Bibliotecas de Chromium | solo si usas Playwright | Revisión visual y e2e de la tienda (F6): `libnss3 libnspr4 libasound2t64` | Tienda |

En Ubuntu o WSL (Debian y derivados), lo que suele faltar se instala así:

```bash
sudo apt-get update
sudo apt-get install -y jq curl uuid-runtime openssl python3 git     # las de línea de comandos
sudo apt-get install -y libnss3 libnspr4 libasound2t64               # solo para Playwright / Chromium
```

Node, pnpm y `vp` no vienen de `apt`: instala Node con tu gestor de versiones (fnm, nvm…) y consulta [Vite+](../apps/store-web/AGENTS.md) para `vp`. En macOS: `brew install jq`; `uuidgen` y `curl` ya vienen con el sistema. Si falta `jq`, los ejemplos siguen sirviendo: copia el token a mano de la respuesta.

## 3. De dónde sale cada dato

Cada pregunta tiene **una** fuente de verdad. Si un documento contradice al código, **gana el código** y el documento se corrige en el mismo commit.

| Pregunta | Fuente |
|---|---|
| ¿Qué tarea toca y qué se comprueba? | La fila de la tarea (índice: capa, tipo, rigor, objetivo, «Depende de») y su bloque de detalle («Se comprueba» con casillas) en el archivo de su HU, `historias/fase-n/HU/HU-nn.md` (o `fase-n/EN/EN-nn.md`); su estado, en la matriz de su fase (`historias/fase-n/matriz.md`; el índice, en [`historias/README.md`](historias/README.md)) |
| ¿Qué debe hacer el producto? | [`product/`](product/README.md): reglas `RN-nn` (03), historias `HU-nn` (04), decisiones `DP-nn` (09), pantallas `PA-nn` (06) |
| ¿Cuál es el contrato HTTP? | [`api-contrato.md`](api-contrato.md) y, ejecutándose, `/docs-json` |
| ¿Cómo está construido y por qué? | [`CLAUDE.md`](../CLAUDE.md), [`backend/05-piezas-clave.md`](backend/05-piezas-clave.md) y «Decisiones y desvíos» del archivo de la historia (lo que se apartó del plan) y el porqué de cada regla en [`historias/README.md`](historias/README.md) (lo anterior, en `avance.md` y los `00-avance.md` congelados) |
| ¿Cómo se prueba? | [`backend/06-tests.md`](backend/06-tests.md) y [`frontend/06-tests.md`](frontend/06-tests.md) |
| ¿Qué está abierto o por decidir? | las ideas de las matrices de cada fase (el índice, en [`historias/README.md`](historias/README.md); `estado: idea`) y [`product/09-decisiones-y-preguntas.md`](product/09-decisiones-y-preguntas.md) (el historial anterior, en `avance.md` y los `00-avance.md` congelados) |
| ¿Qué datos hay para probar a mano? | «Datos de ejemplo» del README del backend (seed) |

## 4. Del requisito a la tarea: el ciclo

Dos fases: primero la **historia** se convierte en tareas (una vez, con tu aprobación) y después cada **tarea** sigue siempre el mismo ciclo.

### 4.1 De la historia a las tareas (`/hu`)

| # | Paso | Qué sale |
|---|---|---|
| 1 | **Redactar o ampliar la HU** en lenguaje de producto: «Como…, quiero…, para…», reglas `RN`, pantallas `PA`, criterios **Dado/Cuando/Entonces** y un **«Listo cuando…»** (el escenario de punta a punta que la da por terminada) | El texto, **aprobado por ti**. Una decisión que contradice una `RN`/`DP` se pregunta ahora, con opciones y una recomendada |
| 2 | **Repartir cada criterio en capas**: qué exige del backend (`[API]`), qué de la tienda (`[WEB]`) y qué solo se ve de punta a punta (`[E2E]`); lo de producto y guías va en `[DOC]` | La lista de tareas, cada una de **una capa**, con lo que se comprueba |
| 3 | **Fijar el contrato y la pantalla.** Si alguna tarea es `[WEB]`, la HU lleva una sección **«Pantalla»**: **dónde** va lo que cambia (respecto a qué elemento), un croquis en texto si una frase no basta, los **estados**, los **textos exactos** de [`product/07`](product/07-contenido-y-mensajes.md), qué cambia entre móvil (360 px) y escritorio (1280 px) y la accesibilidad; reutiliza los [tokens y componentes](product/diseno/README.md) existentes (una pantalla nueva o un componente grande va antes en una tarea `[DOC]` que actualiza el wireframe y el mockup), o «Sin cambios visuales». Si alguna es `[API]`, lleva una sección **«Contrato»** con las rutas y métodos, el cuerpo, un **ejemplo JSON de la respuesta**, los errores nuevos, la compatibilidad (¿es aditivo?) y lo que no cambia; o «Sin cambios en el contrato». Y la sección **«Impacto en el producto»**: qué reglas (`RN`), decisiones (`DP`), pantallas (`PA`), textos y guías vivas toca (con acción y estado), o «Sin impacto en el producto»: esos documentos dicen siempre lo que es verdad hoy y la historia es el registro del cambio. Es lo que une backend y tienda, y lo que tú apruebas sin leer código | Las secciones «Pantalla» y «Contrato» (el comprobador de `scripts/historias.py` las exige) |
| 4 | **Ordenar**: `[DOC]` → `[API]` → `[WEB]` (la primera lleva `/cambio-de-contrato`) → `[E2E]`; anotar de qué depende cada una. Un cambio de contrato se hace primero **aditivo**: la compuerta no se rompe en ninguna tarea | El archivo de la HU en [`historias/`](historias/README.md), con 📝 en todo (pasan a ⬜ al aprobar) |
| 5 | **Aprobar el desglose.** Hasta que lo apruebas no se escribe código | Las tareas listas para ejecutarse |

**Tipo y rigor de cada tarea.** La tabla de tareas tiene dos columnas justo después de la capa: **Tipo**, que **se elige por lo que cambia** (no por cómo se programa) y se escribe exacto, en **kebab-case**. `[API]`: `contrato` (lo que la API le ofrece a la tienda: un endpoint, **un campo más en una respuesta**, un error), `regla` (cómo decide el negocio), `evento`, `base-de-datos`, `configuracion`; `[WEB]`: `pantalla` (lo que se ve), `comportamiento` (lo que la tienda hace sin cambiar lo que se ve); `[DOC]`: `producto`, `guia`; `[E2E]`: `recorrido`. **La tabla completa, con ejemplos y la receta de cada tipo, está en la [plantilla de historias](historias/plantillas/HU.md)** (también: `python3 scripts/historias.py --tipos`). **Rigor**, que se escribe **en todas las filas**: `critico` marca una tarea **crítica** (mutaciones obligatorias y plan corto antes de codificar) y `normal` es el resto. Solo `[API]` puede ser `critico`, y `base-de-datos` y `evento` siempre lo son. Un endpoint nuevo con lógica nueva son **dos tareas** (la `regla` y el `contrato`). `scripts/historias.py` valida el vocabulario y el rigor y lo compara con esa tabla.

**Un pendiente que aún no se desglosa se anota como una `idea`** (estado `idea`, desde [`idea.md`](historias/plantillas/idea.md): solo el encabezado y unas frases) y se promueve a `propuesta` completando la plantilla. **Cada historia nueva es un archivo** (`historias/fase-n/HU/HU-nn.md`, o `fase-n/EN/EN-nn.md` si es un habilitador, dentro de la carpeta de su fase y de su tipo y con solo el correlativo por nombre, a partir de la [plantilla](historias/plantillas/HU.md) (o de [`EN.md`](historias/plantillas/EN.md); los valores de cada campo, en el [diccionario](historias/plantillas/README.md)); cada fase se describe en el `README.md` de su carpeta) y **una ampliación de una historia anterior es una historia nueva** que dice en su encabezado `amplia: HU-22`: el histórico no se edita. **El contrato y la pantalla van por adelantado; el plan de implementación, no.** La historia no lista archivos ni clases porque se desactualizan: eso se decide justo antes de cada tarea (4.2). Una tarea está **lista para ejecutarse** cuando alguien puede escribir su primera prueba roja leyendo solo su fila; el detalle que necesita depende de ella:

| Tarea | Detalle antes de ejecutarla |
|---|---|
| `[DOC]` y `[WEB]` simples | Comprobaciones concretas en su bloque |
| `[WEB]` que cambia lo que se ve | + la **Pantalla** de la HU, y se revisa en un navegador real a 360 y 1280 px |
| `[API]` que cambia la API | + el **Contrato** de la HU |
| `[API]` con rigor `critico` (dominio, seguridad, dinero, concurrencia, migración, evento) | + reglas e invariantes |
| `[E2E]` | El escenario paso a paso |

**Diagramas (opcionales).** Cuando una frase o una tabla no basta, la historia puede llevar un diagrama Mermaid, uno por idea y pequeño: **secuencia** para el orden de una conversación entre piezas o cómo falla algo (en «Contrato»), **estados** para qué estados tiene algo (en «Pantalla»), **flujo** para una decisión con ramas o las dependencias entre tareas. Lleva los textos reales de la tienda y de la API, no duplica el contrato ni el croquis (que siguen siendo la fuente de verdad) y se actualiza en la misma tarea que cambie lo que muestra. GitHub y los editores lo dibujan; en la terminal se ve como texto, por eso va acompañado de una frase.

Un habilitador `EN-nn` (arquitectura, rendimiento, seguridad, accesibilidad, despliegue) se desglosa igual, citando la regla `RN` o el requisito de [`product/08`](product/08-requisitos-de-experiencia.md) que lo justifica.

**Ejemplo (piloto, aún sin implementar):** «en la lista no veo si hay stock y recién al pagar sale un aviso que no dice qué libro es» se convierte en tres historias nuevas, cada una en su archivo: HU-12 (ver el stock), HU-23 (el carrito marca los libros sin stock; amplía HU-22) y HU-35 (el error de pago nombra el libro; amplía HU-33), con diez tareas entre `[DOC]`, `[API]`, `[WEB]` y `[E2E]`. Están en [`historias/`](historias/README.md).

### 4.2 El ciclo de una tarea (`/tarea`)

Diez pasos (del 0 al 9), en este orden. El ejemplo es una tarea real del corte 7 (histórica): **7.8** (`GET /me/orders`), que hoy sería una tarea `[API]` de la HU-40.

| # | Paso | En la 7.8 |
|---|---|---|
| 0 | **Empezar**: pasar el Estado de la tarea a `⏩ en-curso` y ejecutar `python3 scripts/historias.py`, que **sella el inicio** en la tabla «Ejecución» de la HU | `HU-12.2` en-curso, inicio sellado |
| 1 | **Leer** la fila de la tarea, su bloque de detalle («Se comprueba»), de qué depende y las reglas que cita | «cada comprador ve solo lo suyo, el administrador ve el de cualquier cliente, la paginación sigue igual»; reglas RN-36, RN-40 y DP-18 |
| 2 | **Receta y plan corto.** La columna **Tipo** de la fila dice qué receta cargar (la **receta por tipo** está en la [plantilla de historias](historias/plantillas/HU.md)). El plan corto, solo en las tareas con rigor `critico` o de varios archivos: en el modo de planificación, qué archivos, qué patrón se copia, qué pruebas y qué mutaciones; se aprueba y **no se guarda en un archivo** | (en el corte 7 no existía este paso) |
| 3 | **Pruebas primero** y verlas fallar | `test/e2e/my-orders.e2e.spec.ts` (14 pruebas) falla porque la ruta no existe |
| 4 | **Implementar** lo mínimo, con el estilo del código vecino | `my-orders.controller.ts`, `admin-order.controller.ts`, `list-orders.dto.ts` |
| 5 | **Revisión visual** (solo `[WEB]` que cambia lo que se ve): la tienda en un navegador real (Playwright, con la API y el seed) a 360 y 1280 px, comparada con la **Pantalla** de la HU; se anota en la bitácora qué se revisó y qué se ajustó. No hay pruebas de captura píxel a píxel (se rompen con cualquier cambio de contenido); el contraste y los objetivos táctiles los cubre axe en la `[E2E]` | (en el corte 7 no había pantallas) |
| 6 | **Compuerta**: `scripts/verify.sh` (detecta sola si tocaste backend, tienda o ambos) | tipos, lint, formato, build, 1120 unitarias y 902 de integración y e2e |
| 7 | **Mutaciones** si la tarea tiene rigor `critico` (solo `[API]`) | 15 cambios deliberados, todos detectados |
| 8 | **Documentos** en el mismo commit | casillas del bloque, Estado de la fila (`hecho`), «Decisiones y desvíos», bitácora con los conteos reales y `api-contrato.md`; `python3 scripts/historias.py` **sella el fin y el tiempo** de la tarea y actualiza las matrices |
| 9 | **Un commit** con el prefijo de la tarea y su capa (formato y hook: «Reglas del ciclo», abajo) | hoy: `HU-40.2 [API]: Add GET /me/orders…` (entonces: `7.8: …`) |

Reglas del ciclo:

- **Se detiene en el primer fallo.** Nunca se hace el commit con la compuerta en rojo, y la compuerta, el cierre de los documentos y el commit van **en una sola cadena**.
- **Lo vigente se escribe antes del código.** La primera tarea `[DOC]` de una historia **reescribe** las reglas, decisiones y pantallas de su sección «Impacto en el producto» (no les añade «ahora además…»), deja en cada línea la marca `Cambios: HU-nn (AAAA-MM-DD)` y pasa su fila a `hecho`. `scripts/historias.py` lo comprueba (lo citado existe, la marca está, una historia no se cierra con filas `pendiente`), avisa si dos historias abiertas cambian lo mismo y genera [`product/cambios.md`](product/cambios.md). Una decisión reemplazada no se borra: queda «reemplazada por DP-nn».
- **El commit de una tarea.** Su asunto es `HU-nn.k [CAPA]: Mensaje` (`EN-nn.k [CAPA]: …` en un habilitador), por ejemplo `HU-12.3 [API]: Add availability to GET /books`: el id de **la** tarea (un commit es de una sola tarea), la capa **de esa tarea** (`API`, `WEB`, `E2E` o `DOC`, en mayúsculas) y un mensaje **en inglés y en imperativo** («Add…», no «Added…»), con el asunto completo de **72 caracteres como máximo**; el cuerpo y la línea `Co-Authored-By:` van debajo. El hook `.githooks/commit-msg` (`scripts/commit_msg.py`) lo comprueba **solo en los commits que empiezan por `HU-` o `EN-`**: que el formato sea ese, que la tarea exista en alguna historia y que la capa sea la suya; los demás commits (`Process: …`, un arreglo, una fusión) pasan sin validar. Se activa **una sola vez por clon** con `git config core.hooksPath .githooks`. El **correlativo 0** no es una tarea: es el commit que **registra** la historia o el habilitador (su archivo ya aprobado, antes de ejecutar nada), por ejemplo `EN-03.0 [DOC]: Register the enabler…`; vale si el archivo existe y su capa es `DOC`.
- **Los archivos de historial congelado no se tocan.** Un archivo que empieza con «❄️ Historial congelado desde AAAA-MM-DD. Este archivo no se actualizará más» (los `avance.md`, los `07-fases-y-roadmap.md`, la guía original y `product/04`) se conserva como registro. El hook `.githooks/pre-commit` (`scripts/pre_commit.py`) rechaza un commit que lo modifique, borre o renombre, mirando su última versión commiteada; poner la advertencia a un archivo por primera vez sí se permite. Un cambio legítimo (un enlace roto, por ejemplo) se hace a propósito con `ALLOW_FROZEN_EDIT=1 git commit …`. Se activa con el mismo `git config core.hooksPath .githooks`.
- **El contrato y la pantalla aprobados mandan.** Una tarea `[API]` cumple la sección «Contrato» de su HU tal cual, y una `[WEB]` que cambia lo que se ve cumple su «Pantalla» (ubicación, textos, estados, tonos); si al implementar hay que apartarse, se detiene y se vuelve a pedir aprobación: no se decide al programar.
- **Una tarea, una capa.** Si al implementarla aparece trabajo en la otra capa, no se mezcla: se añade como tarea nueva de la HU (con su dependencia) y se te avisa.
- **Los números de la documentación salen de la última ejecución**, copiados de la salida. Nunca de memoria.
- **Los documentos se marcan en los tres sitios** del archivo de la HU: las **casillas** del bloque de la tarea (todas `- [x]`), el **Estado** de su fila (`⏩ en-curso` → `✅ hecho`) y **su** bitácora. Después se regeneran las matrices con `python3 scripts/historias.py` (también comprueba que el archivo está bien formado).
- **Si se pide una HU entera** («haz la HU-12»), se encadenan sus tareas en orden sin detenerse a informar entre una y otra; el informe va una vez, al final.
- **Cerrar la HU**: cuando todas sus tareas están ✅ **y** su «Listo cuando…» se ejecutó de verdad (la tarea `[E2E]`), el archivo pasa a `estado: cerrada` y la matriz de su fase muestra su fecha de cierre y su tiempo (salen de `git log`); el script no deja cerrar una HU sin `[E2E]` ni con tareas pendientes. Una HU con tareas hechas pero sin su `[E2E]` no está cerrada.
- **Ramas:** una sola rama de trabajo para varias historias (hoy `feature/mvp`). **No se abren pull requests ni se sube nada** sin que lo pida quien manda el proyecto.

## 5. Cuánto rigor

| | Qué se exige |
|---|---|
| **Pruebas primero** | Siempre, en toda tarea |
| **Compuerta** | Siempre, antes de cada commit |
| **Mutaciones** | **Obligatorias** en dominio, seguridad (tokens, contraseñas, guards, roles, CORS, límites), dinero y precios, concurrencia y transacciones (outbox, reservas, idempotencia) y restricciones de la base. **Opcionales** en DTO de solo forma, documentación de Swagger, textos y cableado trivial |
| **Tareas `[WEB]`** | Compuerta (`vp check`, `vp test`, build). Las mutaciones automáticas son solo de las tareas `[API]` |
| **Tareas `[E2E]`** | Playwright contra el backend real (`pnpm run test:e2e`; también contra el build de producción y `test:perf` si la HU toca rendimiento). No están en la compuerta: se ejecutan a mano y se anotan sus conteos |

Una prueba que no puede fallar no protege nada. Por eso, para el código crítico, se rompe a propósito y se mira si alguna prueba lo nota ([mutar](herramientas-de-trabajo.md#3-pruebas-de-mutación-scriptsmutatepy)).

## 6. Recetas: qué comando usar

| Quiero… | Comando de Claude | Se explica en |
|---|---|---|
| Convertir una historia en tareas (desglose para aprobar) | `/hu` | [herramientas §4.8](herramientas-de-trabajo.md#48-hu) |
| Hacer una tarea de una HU, de principio a fin | `/tarea` | [herramientas §4.1](herramientas-de-trabajo.md#41-tarea) |
| Probar que las pruebas detectan errores | `/mutar` | [§4.2](herramientas-de-trabajo.md#42-mutar) |
| Añadir un endpoint | `/nueva-ruta` | [§4.3](herramientas-de-trabajo.md#43-nueva-ruta) |
| Añadir una variable de entorno | `/nueva-variable-entorno` | [§4.4](herramientas-de-trabajo.md#44-nueva-variable-entorno) |
| Cambiar la base de datos | `/nueva-migracion` | [§4.5](herramientas-de-trabajo.md#45-nueva-migracion) |
| Que un contexto reaccione a otro | `/nuevo-evento` | [§4.6](herramientas-de-trabajo.md#46-nuevo-evento) |
| Llevar un cambio de la API a la tienda | `/cambio-de-contrato` | [§4.7](herramientas-de-trabajo.md#47-cambio-de-contrato) |
| Verificar todo antes de un commit | `scripts/verify.sh` | [§2](herramientas-de-trabajo.md#2-la-compuerta-scriptsverifysh) |

## 7. Backend y tienda: el contrato

El contrato es el OpenAPI que publica el backend (`/docs-json`). La tienda lo convierte en tipos (`apps/store-web/src/shared/api/schema.d.ts`, que **se sube a git**) y **solo** importa de `shared/api/types.ts`, nunca del archivo generado.

- **Un cambio de la API** se hace primero en una tarea `[API]` (código, pruebas, compuerta y `api-contrato.md`) y después se propaga a la tienda con `/cambio-de-contrato`, **dentro de la primera tarea `[WEB]`** de la HU (depende de la `[API]`): regenerar `schema.d.ts` con el backend real levantado, ajustar los alias, `vp check` y `vp test`, y actualizar los documentos.
- **Una decisión de producto que el cambio contradice** (`DP-nn`) no se resuelve en silencio: se pregunta. Un cambio que **quita o renombra** algo que la tienda ya usa se hace en dos tareas (primero se añade lo nuevo y la tienda pasa a usarlo; después se quita lo viejo) para que la compuerta no se rompa entre una y otra. Ejemplo real: `DP-15` esperaba la dirección en `GET /orders/:id` y el backend cerró el corte 7 sin ella; se preguntó, se eligió añadirla y se documentó en producto, contrato y frontend.
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

- **Se pregunta** cuando hay una decisión que cambia lo que se construye y no está en los documentos (incluido el texto de una HU nueva y su desglose en tareas, que se aprueban antes de escribir código): se plantean **opciones con una recomendada (la primera)** y se espera la respuesta antes de aplicar. Una vez decidido, no se reabre.
- **No se pregunta** lo que tiene un valor por defecto convencional ni lo que se puede comprobar en el código.
- **No se hace sin pedirlo:** abrir pull requests, subir ramas, cambiar el CI, tocar la base de desarrollo de quien trabaja, ni borrar archivos que no se han mirado.
- **Se informa con honestidad:** los conteos reales, los errores propios y lo que quedó abierto. «Verificado» solo se dice de lo que se ejecutó, no de lo que se leyó.

## 10. Trabajar con Claude: frases que funcionan

| Quiero… | Digo… |
|---|---|
| Que una necesidad nueva pase por una historia | «quiero que la tienda muestre el stock» (Claude propone la HU y el desglose con `/hu`, y espera tu aprobación) |
| Desglosar una historia que ya existe | «`/hu HU-40`» o «desglosa la HU-12» |
| Continuar el trabajo | «continúa con la siguiente tarea» (Claude usa `/tarea` sobre la primera tarea ⬜ cuyas dependencias estén ✅) |
| Una historia entera, sin interrupciones | «haz toda la HU-12» |
| Una tarea concreta | «`/tarea HU-12.3`» |
| Solo un plan, sin implementar | «solo la planificación por ahora» |
| Decidir yo antes de que se aplique | «dame opciones con una recomendada» |
| Revisar lo hecho | «¿qué queda pendiente?» (Claude lee el índice de `historias/README.md` y la matriz de la fase en curso, con sus ideas) |
| Propagar un cambio a la tienda | «`/cambio-de-contrato`» |

## 11. Glosario de siglas

| Sigla | Significa | Dónde |
|---|---|---|
| **HU-nn.k** | Tarea k de la historia HU-nn (`HU-12.3`); su commit lleva también la capa | `historias/fase-n/HU/HU-nn.md` |
| **EN-nn** | Habilitador: trabajo técnico sin historia propia (arquitectura, rendimiento, seguridad…), ligado (`ligado:` en el encabezado, obligatorio) a una `RN`, una `DP`, un requisito de `08` o una decisión de arquitectura de `docs/backend/`; sus reorganizaciones de código son tareas de tipo `refactor` | `historias/fase-n/EN/EN-nn.md` |
| **[API] [WEB] [E2E] [DOC]** | La capa de una tarea: backend, tienda, recorrido de punta a punta contra el backend real, o producto y guías sin código | `historias/` |
| **N.M / FN.M** | Tareas de los cortes anteriores a 2026-10-30 (`7.6`, `F4.6`); historial, no se reutilizan | `backend/00-avance.md`, `frontend/00-avance.md` |
| **RN-nn** | Regla de negocio | `product/03-reglas-de-negocio.md` |
| **HU-nn** | Historia de usuario. Las 20 anteriores a 2026-10-30, en `product/04-historias-de-usuario.md` (histórico); las nuevas, en su archivo de `historias/` | `historias/README.md` |
| **PA-nn** | Pantalla | `product/06-pantallas-y-navegacion.md` |
| **DP-nn** | Decisión de producto | `product/09-decisiones-y-preguntas.md` |
| **D1…D8** | Decisiones de diseño del corte 7 (sesión, contraseñas, alta, cliente…) | `backend/00-avance.md`, corte 7 |
| **Corte** | Antes: un grupo de tareas de una sola capa con su «listo cuando». Ahora el equivalente es la HU y su «Listo cuando» | los dos `00-avance.md` (historial) |
| **Listo cuando** | El escenario de punta a punta que cierra una HU (lo ejecuta la tarea `[E2E]`) | `historias/` |
| **Compuerta** | La cadena de comprobaciones antes de un commit | `scripts/verify.sh` |
| **Mutación** | Un cambio deliberado del código para ver si las pruebas lo detectan | `scripts/mutate.py` |
