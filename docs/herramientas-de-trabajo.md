# Herramientas de trabajo: scripts y comandos de Claude

> Qué se creó para implementar con orden, cómo se usa cada pieza y ejemplos reales. El flujo general está en la [guía de desarrollo](guia-de-desarrollo.md).

## 1. Qué hay y dónde

| Pieza | Dónde | Para qué |
|---|---|---|
| Compuerta | `scripts/verify.sh` (también `pnpm run verify` en cada app) | Comprobar todo antes de un commit; se detiene en el primer fallo |
| Mutaciones | `scripts/mutate.py` | Romper el código a propósito y ver si las pruebas lo detectan |
| Pruebas de las mutaciones | `scripts/test_mutate.py` | Comprobar que la herramienta restaura los archivos y clasifica bien |
| Matriz de historias | `scripts/historias.py` (pruebas: `scripts/test_historias.py`) | Genera la matriz de cada fase (`docs/historias/fase-n/matriz.md`: una tabla de historias y otra de habilitadores, ordenadas por ID; estado, fechas y tiempo desde `git log`) y el índice de fases de `docs/historias/README.md`, **sella el inicio y el fin de cada tarea** en la tabla «Ejecución» de su historia genera el registro cronológico [`product/cambios.md`](product/cambios.md) con la sección «Impacto en el producto» de cada historia y comprueba que cada archivo de historia esté bien formado, que lo que cita en «Impacto» exista y lleve su marca `Cambios: HU-nn` cuando esté `hecho`, y que sus tipos coincidan con la tabla de la plantilla, y que cada habilitador `EN` tenga su `ligado:` (avisa, sin fallar, si dos historias abiertas cambian lo mismo): `python3 scripts/historias.py`, `--check`, o `--tipos` para imprimir la tabla de tipos |
| Hook de commits | `.githooks/commit-msg` → `scripts/commit_msg.py` (pruebas: `scripts/test_commit_msg.py`) | Valida el asunto de los commits de una tarea (`HU-12.3 [API]: Add…`: formato, tarea existente, su capa, una sola tarea, 72 caracteres; el correlativo `.0` registra la historia o el habilitador y es `[DOC]`); los demás commits pasan. Se activa una vez por clon: `git config core.hooksPath .githooks` |
| Hook de archivos congelados | `.githooks/pre-commit` → `scripts/pre_commit.py` (pruebas: `scripts/test_pre_commit.py`) | Rechaza un commit que modifique, borre o renombre un archivo que empieza con «❄️ Historial congelado desde …» (mira su última versión commiteada, así que ponerle la advertencia sí se permite). Para un cambio legítimo: `ALLOW_FROZEN_EDIT=1 git commit …`. Se activa con `git config core.hooksPath .githooks` |
| 8 comandos de Claude | `.claude/skills/<nombre>/SKILL.md` | El flujo y las listas de comprobación que Claude sigue |
| Resumen para Claude | `CLAUDE.md` | Se carga solo en cada sesión y enlaza a esta documentación |

Las herramientas que hay que tener instaladas (`docker`, `python3`, `jq`, `uuidgen`…) están en los [requisitos previos de la guía de desarrollo](guia-de-desarrollo.md#requisitos-previos).

## 2. La compuerta: `scripts/verify.sh`

```bash
scripts/verify.sh              # auto: detecta qué tocaste
scripts/verify.sh backend      # solo el backend
scripts/verify.sh frontend     # solo la tienda
scripts/verify.sh all          # los dos
pnpm run verify                # dentro de apps/main-api o de apps/store-web: su parte
```

**Modo `auto`** (el de por defecto) mira lo que hay **sin commitear**:

| Cambios sin commitear | Qué ejecuta |
|---|---|
| Algo en `apps/main-api/` | backend |
| Algo en `apps/store-web/` | tienda |
| Las dos cosas, o algo en `scripts/` o `.github/` | todo |
| Solo documentos | nada: `✓ Solo documentación: no hay nada que verificar` |
| Nada sin commitear | todo |

**Qué ejecuta cada parte**, en este orden y deteniéndose en el primer fallo:

| Backend | Tienda |
|---|---|
| `tsc` (tipos) | `vp check` (formato, lint con tipos y tipos) |
| lint **sin avisos** (un aviso es un fallo) | `vp test` |
| formato (Prettier) | build (`tsc` + `vp build`) |
| build | |
| pruebas unitarias | |
| integración y e2e (levanta su propio PostgreSQL con Testcontainers: **necesita Docker**) | |

**Una salida real** (modo `all`, árbol sin fallos):

```
→ compuerta: all
✓ tsc
✓ lint limpio
✓ formato
✓ build
      Tests  1162 passed (1162)
      Tests  1014 passed (1014)
✓ backend verde
✓ vp check
      Tests  56 passed (56)
✓ build
✓ frontend verde
✓ TODO VERDE
```

**Qué cuenta como verde.** El script exige que exista el resumen de Vitest (`Tests  N passed`). Si Vitest no arrancó, o todo quedó «skipped», no hay resumen y es un **fallo** (`integración/e2e sin resumen`): un arranque roto no es un verde.

**Cuando falla:**

```
✗ FALLÓ: lint con avisos
```

- Para el backend, el detalle de un fallo de integración o e2e se guarda en `apps/main-api/.verify-last-failure.txt` (no se sube a git). Ahí está la salida completa y los nombres de las pruebas que fallaron.
- Si el fallo no se repite al correr solo el archivo, **no lo descartes**: anótalo en «Problemas abiertos» con lo que sepas (el corte 7 dejó un caso así).

**Tiempos.** El backend tarda unos minutos (los e2e arrancan un contenedor y corren los archivos uno tras otro). No lo lances mientras corre otra cosa pesada que use Docker o la CPU: se ralentiza y puede dar fallos de tiempo.

## 3. Pruebas de mutación: `scripts/mutate.py`

Una prueba que pasa aunque el código esté roto no protege nada. La herramienta rompe el código en un punto, corre solo las pruebas que cubren ese archivo y mira si alguna falla. **Siempre restaura el archivo**, aunque las pruebas fallen o se interrumpan.

**Se usa desde un script de la tarea, fuera del repositorio** (por ejemplo en `$CLAUDE_JOB_DIR/tmp/`):

```python
import sys; sys.path.insert(0, '/ruta/al/repo/scripts')
from mutate import mutate, report

SRC = 'src/contexts/identity/infrastructure/login.handler.ts'   # ruta relativa a apps/main-api
T = ['test/integration/login.handler.spec.ts']

mutate('L1 la contraseña no se comprueba', SRC, [('if (!user || !valid)', 'if (!user)')], T)
mutate('L2 el usuario no se comprueba',    SRC, [('if (!user || !valid)', 'if (!valid)')], T)
mutate('L3 ancla que no existe',           SRC, [('esto no existe', 'x')], T)
report()
```

**Una salida real** (con dos mutaciones sobre el proyecto y una mala a propósito):

```
### prueba: sin comprobar la contraseña: DETECTADA (9 failed | 13 passed (22))
### prueba: unitarias: DETECTADA (29 failed | 16 passed (45))
### prueba: ancla mala: NO APLICADA (el ancla aparece 0 veces) -> 'esto no existe'
=== 3 mutaciones: 2 DETECTADA, 1 NO APLICADA
    NO APLICADA: prueba: ancla mala
```

**Los cuatro veredictos:**

| Veredicto | Qué significa | Qué hacer |
|---|---|---|
| `DETECTADA` | Alguna prueba falló: el cambio se notó | Nada |
| `SOBREVIVIÓ` | Todas pasaron | O falta una prueba (escríbela y repite la mutación), o el cambio es **equivalente** (otra comprobación posterior da el mismo resultado): simplifica el código redundante o anótalo en la bitácora como equivalente |
| `NO COMPILA` | No hubo resumen o todo quedó omitido: el cambio rompió el arranque | Cuenta como detectada, pero conviene una mutación mejor que no rompa el arranque |
| `NO APLICADA` | El ancla no existe o aparece más de una vez | Copiarla del archivo **ya formateado por Prettier**; si se repite, ampliar el texto hasta que sea único |

**Qué mutaciones inventar.** Piensa qué error sería grave: quitar una comprobación, invertir una condición (`!` de más o de menos), cambiar un límite en uno (`>` por `>=`, `20` por `21`), devolver un valor fijo, quitar un `WHERE` o un filtro por dueño, cambiar un código de error, quitar una restricción de la base. Si el único cambio posible no altera el comportamiento, es un equivalente.

**Reglas:**

| Regla | Qué significa |
|---|---|
| Qué configuración de Vitest se usa | La herramienta la elige sola (unitarias con la de siempre; integración y e2e con la de e2e) y **rechaza mezclar las dos** en una misma mutación. Es lo que evita el error de que una mutación «sobreviva» solo porque no incluía sus pruebas |
| Junto a la compuerta | No la corras a la vez que la compuerta |
| Qué se anota | En la bitácora: cuántas mutaciones hiciste, cuántas se detectaron a la primera y qué se hizo con cada superviviente. Si lanzaste algo mal, dilo |
| Sus propias pruebas | `cd scripts && python3 -m unittest test_mutate` (restaura el archivo siempre, clasifica los veredictos, rechaza anclas repetidas y la mezcla de configuraciones) |

## 4. Los comandos de Claude

Son instrucciones guardadas en `.claude/skills/<nombre>/SKILL.md`. Se usan de dos maneras:

- **Escribiéndolos**: `/tarea`, `/tarea 8.1`, `/nueva-ruta`… Lo que añadas después del nombre se le entrega a Claude («`/tarea 8.1`» le dice qué tarea).
- **Sin escribirlos**: Claude también los elige solo cuando tu petición encaja con su descripción («continúa con la siguiente tarea» activa `/tarea`).

Si un comando recién creado no aparece, reinicia la sesión de Claude Code. Un comando **no ejecuta código por sí mismo**: carga el procedimiento que Claude sigue (leer, escribir pruebas, usar los scripts…).

### 4.1 `/tarea`

**Para qué:** implementar una tarea de una historia (`HU-nn.k`), de principio a fin.

**Cuándo:** al empezar cualquier tarea ya aprobada de una historia de [`historias/`](historias/README.md), o con «continúa con la siguiente tarea». Si la historia aún no está desglosada y aprobada, `/tarea` no escribe código: pasa primero por `/hu`.

**Cómo pedirlo:**
```
/tarea HU-12.3
continúa con la siguiente tarea
haz toda la HU-12
```

**Qué hace Claude:** pasa la tarea a `⏩ en-curso` y **sella su inicio** (`python3 scripts/historias.py`) → lee la fila de la tarea (su capa, tipo, rigor, objetivo y «Depende de»), **su bloque de detalle** («Se comprueba» con sus casillas) y las reglas que cita → comprueba que sus dependencias están ✅ y que está lista para ejecutarse → (si la tarea tiene rigor `critico` o es grande) te muestra un **plan corto** en el modo de planificación y espera → escribe las pruebas y comprueba que fallan → implementa **solo su capa** → (si es una `[WEB]` que cambia lo que se ve) la **revisa en un navegador real** a 360 y 1280 px contra la «Pantalla» de la HU → pasa la compuerta → hace mutaciones si la tarea tiene rigor `critico` → actualiza los tres sitios del archivo de la HU (las casillas del bloque, el Estado de la fila y la bitácora) y los documentos que toquen, y regenera las matrices (`python3 scripts/historias.py`, que además **sella el fin y el tiempo** de la tarea) → un commit `HU-nn.k [CAPA]: …`. Si la última tarea ✅ es la `[E2E]` y deja cumplido el «Listo cuando…», cierra la HU (`estado: cerrada`). Si algo no está decidido, te plantea opciones con una recomendada y espera.

**Ejemplo histórico (corte 7, tarea 7.6, guard de acceso; entonces el prefijo era `N.M`):** pruebas del guard (45 unitarias) y del recorrido de rutas (17 e2e) → `AuthGuard` global → compuerta (1116 unitarias, 871 de integración y e2e) → 32 mutaciones, 30 detectadas a la primera y 2 cubiertas → bitácora → commit `7.6: Add the default-deny auth guard and @Public, @Roles, @CurrentUser`.

**Qué deja:** el código, sus pruebas, los documentos al día y un commit.

### 4.2 `/mutar`

**Para qué:** comprobar que las pruebas de un cambio detectan errores.

**Cuándo:** después de implementar código crítico del backend (dominio, seguridad, dinero, concurrencia, restricciones de la base).

**Cómo pedirlo:**
```
/mutar
prueba con mutaciones el login
```

**Qué hace Claude:** piensa los errores graves de ese código, escribe un script con `mutate()` (§3), lo corre, lee los veredictos y, por cada superviviente, escribe una prueba, simplifica el código o lo documenta como equivalente. Termina con un resumen y comprueba `git status`.

**Ejemplo real (7.9, `admin:create`):** 19 mutaciones; 4 sobrevivieron (contraseña igual al correo, mensaje de contraseña vacía, texto del error de la base y costo de `PASSWORD_HASH_LOG_N`); se escribió una prueba para cada una y las 4 pasaron a detectadas.

### 4.3 `/nueva-ruta`

**Para qué:** añadir un endpoint HTTP al backend sin olvidar nada.

**Cuándo:** una ruta nueva, o cambiar el acceso o la forma de una existente.

**Cómo pedirlo:**
```
/nueva-ruta POST /orders/quote
```

**Qué comprueba la lista:** quién puede llamarla (público, comprador, administrador o cualquiera con sesión; el dueño se filtra **dentro de la consulta** y un recurso ajeno da `404`, no `403`) → registrar el acceso en la tabla `EXPECTED` de `test/e2e/route-access.e2e.spec.ts` → DTO que rechaza campos de más y acota tamaños → lógica en un comando o consulta → el usuario sale de `@CurrentUser()`, nunca del cuerpo → límite de intentos si es sensible al abuso → Swagger → pruebas (controlador y e2e con tokens reales) → `api-contrato.md`.

**Ejemplo real (7.8, `GET /me/orders`):** `my-orders.controller.ts` con `@Roles('BUYER')`, `list-orders.dto.ts` (sin `customerId`: si llega, `400`), la fila `'GET /me/orders': 'BUYER'` en la tabla de acceso, 14 pruebas e2e (sin token `401`, administrador `403`, el cursor de otro comprador no lleva a sus pedidos…) y su fila en el contrato.

### 4.4 `/nueva-variable-entorno`

**Para qué:** añadir o cambiar una configuración del backend.

**Cómo pedirlo:** `/nueva-variable-entorno CORS_ORIGINS` (o simplemente «añade una variable para…»).

**Qué comprueba la lista:** el esquema Zod con un valor por defecto **seguro** y límites → una regla de producción si un valor inseguro nunca debe llegar allí (la app no arranca) → leerla con `ConfigService.getOrThrow` → pruebas en `test/unit/platform/env.schema.spec.ts` (por defecto, cada borde, valores no válidos, regla de producción) → ajuste en `global-setup.ts` si estorba a otras pruebas → `.env.example`, tabla del README y guía 02.

**Ejemplo real (7.10, `CORS_ORIGINS`):** vacía por defecto (sin CORS), hasta 20 orígenes normalizados, sin comodines ni rutas, solo `https` en producción; 32 pruebas del esquema (junto con `TRUST_PROXY` y los límites de intentos).

### 4.5 `/nueva-migracion`

**Para qué:** cambiar el esquema de la base de datos.

**Cómo pedirlo:** `/nueva-migracion tabla de movimientos de stock`.

**Qué comprueba la lista:** un schema de PostgreSQL por contexto y sin claves foráneas entre contextos → generar el SQL **sin base de datos** con `prisma migrate diff` → añadir a mano los `CHECK` (Prisma no los declara) → marca de tiempo posterior a la última migración → `prisma generate` → añadir un schema nuevo a `APP_SCHEMAS` de `test/support/database.ts` → pruebas de integración de cada restricción → `03-base-de-datos.md`.

**Ejemplo real (7.4, `identity.refresh_tokens`):** `CHECK` de que el hash tiene 64 caracteres hexadecimales (nunca cabe un token en claro) y de que el vencimiento es posterior a la creación, borrado en cascada al borrar al usuario, y 11 pruebas de integración.

### 4.6 `/nuevo-evento`

**Para qué:** que un contexto reaccione a algo que ocurrió en otro, por el Outbox.

**Cómo pedirlo:** `/nuevo-evento cuando se cancele un pedido, Inventario libera el stock`.

**Qué comprueba la lista:** el contrato en `src/contracts/` con `aggregateId` como propiedad real y sin secretos → escribirlo **en la misma transacción** que el cambio → un consumidor `@OutboxHandler()` (`db` para un efecto único con la transacción de la entrega, `external` si sale a otro sistema) → idempotente y **sin silencios** (lo que no cuadra lanza un error visible) → pruebas de atomicidad, del consumidor y de la ventana entre el cambio y la entrega → una sonda en `test/support/outbox-probes.ts`.

**Ejemplo real (7.3 y 7.5):** `identity.user.registered` se guarda con el usuario en una sola transacción, y `sales.create-customer` crea al cliente con el mismo id; si el correo ya es de otro cliente, la entrega falla de forma visible en lugar de omitirse.

### 4.7 `/cambio-de-contrato`

**Para qué:** llevar un cambio de la API del backend a la tienda web.

**Cuándo:** siempre que cambie una ruta, un cuerpo, una respuesta o un código de error que la tienda consume.

**Cómo pedirlo:** `/cambio-de-contrato` después de terminar el cambio del backend.

**Qué hace Claude:** levanta el backend real con una base temporal (`postgres:18` en Docker, migraciones, `node dist/main.js`) → en `apps/store-web` corre `pnpm run api:types` → apaga lo temporal **por PID** → ajusta `shared/api/types.ts` si cambió algún nombre → `vp check` y `vp test` → actualiza `docs/frontend/03-integracion-con-la-api.md` y producto. Si el cambio contradice una decisión `DP-nn`, **te pregunta**.

**Ejemplo real (DP-15):** `GET /orders/:id` pasó a devolver `shippingAddress`; el esquema regenerado añadió `OrderDetailResponse`, `/me/orders`, `/admin/*` y el esquema Bearer; un solo ajuste (`Order` apunta ahora a `OrderDetailResponse`); `vp check` y `vp test` (56 pruebas) en verde.

### 4.8 `/hu`

**Para qué:** convertir una historia de usuario en tareas verticales para que las apruebes. **No escribe código.**

**Cuándo:** ante una necesidad nueva («quiero que la tienda muestre el stock»), una ampliación de una historia o un habilitador técnico; o para desglosar una historia que ya existe y aún no tiene tareas.

**Cómo pedirlo:**
```
/hu quiero que la tienda muestre el stock
/hu HU-40
desglosa la HU-12
```

**Qué hace Claude:** lee la historia (o redacta el borrador «Como…, quiero…, para…» con sus criterios Dado/Cuando/Entonces y su «Listo cuando…») → busca qué reglas `RN` y decisiones `DP` toca y cuáles contradice (si contradice una, **te pregunta** con opciones y una recomendada) → fija en «Impacto en el producto» qué documentos vivos del producto cambian (y avisa si otra historia abierta toca los mismos) → fija la **pantalla** de las tareas `[WEB]` (dónde va lo que cambia, croquis, estados, textos exactos, móvil y escritorio, accesibilidad) y el **contrato** de las tareas `[API]` (rutas, cuerpo, ejemplo JSON de la respuesta, errores y compatibilidad) → reparte cada criterio en tareas de **una sola capa** (`[DOC]`, `[API]`, `[WEB]`, `[E2E]`), cada una con su **objetivo**, su **tipo** (`contrato`, `regla`, `evento`, `base-de-datos`, `configuracion`, `pantalla`, `comportamiento`…, elegido por lo que cambia y escrito en kebab-case; la tabla completa está en el diccionario `docs/historias/plantillas/README.md` o con `python3 scripts/historias.py --tipos`) y su rigor (`critico` o `normal`) → las ordena, con su dependencia y su «Se comprueba» → la deja como un archivo nuevo en [`historias/`](historias/README.md) (a partir de la plantilla) marcado 📝 y **espera tu aprobación**; si amplía una historia anterior, es una historia nueva con `amplia:` en el encabezado. Al aprobar, pasa a ⬜ y `python3 scripts/historias.py` la agrega a la matriz de su fase.

**Ejemplo (piloto, sin implementar):** tres historias nuevas, cada una en su archivo: HU-12 «Ver si hay stock de un libro», HU-23 (amplía HU-22) y HU-35 (amplía HU-33), con 10 tareas entre `[DOC]`, `[API]`, `[WEB]` y `[E2E]`. Están en [`historias/`](historias/README.md).

## 5. Cómo cambiar o añadir un comando

Cada comando es una carpeta con un `SKILL.md`:

```markdown
---
name: nueva-cosa
description: Una frase que dice QUÉ hace y CUÁNDO usarlo. Claude la lee para decidir si lo activa solo.
---

# Título

1. Paso uno…
2. Paso dos…
```

| Regla | Qué significa |
|---|---|
| El nombre de la carpeta es el nombre del comando | `.claude/skills/nueva-cosa/` → `/nueva-cosa` |
| La descripción importa | Es lo que hace que Claude lo elija. Que diga cuándo usarlo con palabras que tú dirías |
| Mantenlos cortos y precisos | Rutas y nombres reales del repositorio. Si una carpeta o un archivo se mueve, hay que actualizar los comandos que lo nombran |
| Un comando nuevo se prueba en una tarea real | Y se ajusta con lo que falte |

## 6. Estado y límites

| Tema | Qué significa |
|---|---|
| Los scripts están probados | La compuerta se ejecutó en sus tres modos y `mutate.py` tiene sus propias pruebas |
| Los comandos de Claude y su uso real | `/hu`, `/tarea` y `scripts/historias.py` ya se usaron en tareas reales con el proceso por historia (EN-01 a EN-15 de [`historias/`](historias/README.md)). Los otros seis (`/mutar`, `/nueva-ruta`, `/nueva-migracion`, `/nuevo-evento`, `/nueva-variable-entorno` y `/cambio-de-contrato`) todavía no figuran en ninguna tarea ejecutada: sus rutas y nombres se verificaron contra el repositorio, pero la primera tarea que los use mostrará qué les falta |
| Las mutaciones automáticas | Son solo del backend; la tienda usa la compuerta |
| La compuerta no sustituye al CI | El CI corre en GitHub solo al subir a `main`/`develop` o en un pull request |
