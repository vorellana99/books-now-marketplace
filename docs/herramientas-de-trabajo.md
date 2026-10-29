# Herramientas de trabajo: scripts y comandos de Claude

> Qué se creó para implementar con orden, cómo se usa cada pieza y ejemplos reales. El flujo general está en la [guía de desarrollo](guia-de-desarrollo.md).

## 1. Qué hay y dónde

| Pieza | Dónde | Para qué |
|---|---|---|
| Compuerta | `scripts/verify.sh` (también `pnpm run verify` en cada app) | Comprobar todo antes de un commit; se detiene en el primer fallo |
| Mutaciones | `scripts/mutate.py` | Romper el código a propósito y ver si las pruebas lo detectan |
| Pruebas de las mutaciones | `scripts/test_mutate.py` | Comprobar que la herramienta restaura los archivos y clasifica bien |
| 7 comandos de Claude | `.claude/skills/<nombre>/SKILL.md` | El flujo y las listas de comprobación que Claude sigue |
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
- La herramienta elige sola la configuración de Vitest (unitarias con la de siempre; integración y e2e con la de e2e) y **rechaza mezclar las dos** en una misma mutación. Es lo que evita el error de que una mutación «sobreviva» solo porque no incluía sus pruebas.
- No la corras a la vez que la compuerta.
- Anota en la bitácora cuántas mutaciones hiciste, cuántas se detectaron a la primera y qué se hizo con cada superviviente. Si lanzaste algo mal, dilo.
- La propia herramienta tiene pruebas: `cd scripts && python3 -m unittest test_mutate` (restaura el archivo siempre, clasifica los veredictos, rechaza anclas repetidas y la mezcla de configuraciones).

## 4. Los comandos de Claude

Son instrucciones guardadas en `.claude/skills/<nombre>/SKILL.md`. Se usan de dos maneras:

- **Escribiéndolos**: `/tarea`, `/tarea 8.1`, `/nueva-ruta`… Lo que añadas después del nombre se le entrega a Claude («`/tarea 8.1`» le dice qué tarea).
- **Sin escribirlos**: Claude también los elige solo cuando tu petición encaja con su descripción («continúa con la siguiente tarea» activa `/tarea`).

Si un comando recién creado no aparece, reinicia la sesión de Claude Code. Un comando **no ejecuta código por sí mismo**: carga el procedimiento que Claude sigue (leer, escribir pruebas, usar los scripts…).

### 4.1 `/tarea`

**Para qué:** implementar una tarea de un corte, de principio a fin.

**Cuándo:** al empezar cualquier tarea de `00-avance.md`, o con «continúa con la siguiente tarea».

**Cómo pedirlo:**
```
/tarea 8.1
continúa con la siguiente tarea
haz todo el corte 8
```

**Qué hace Claude:** lee la fila de la tarea y las reglas que cita → escribe las pruebas y comprueba que fallan → implementa → pasa la compuerta → hace mutaciones si el código es crítico → actualiza los tres sitios de `00-avance.md` y los documentos que toquen → un commit `N.M: …`. Si algo no está decidido, te plantea opciones con una recomendada y espera.

**Ejemplo real (corte 7, tarea 7.6, guard de acceso):** pruebas del guard (45 unitarias) y del recorrido de rutas (17 e2e) → `AuthGuard` global → compuerta (1116 unitarias, 871 de integración y e2e) → 32 mutaciones, 30 detectadas a la primera y 2 cubiertas → bitácora → commit `7.6: Add the default-deny auth guard and @Public, @Roles, @CurrentUser`.

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

- **El nombre de la carpeta es el nombre del comando** (`.claude/skills/nueva-cosa/` → `/nueva-cosa`).
- **La descripción importa:** es lo que hace que Claude lo elija. Que diga cuándo usarlo con palabras que tú dirías.
- **Mantenlos cortos y precisos:** rutas y nombres reales del repositorio. Si una carpeta o un archivo se mueve, hay que actualizar los comandos que lo nombran.
- **Un comando nuevo se prueba en una tarea real** y se ajusta con lo que falte.

## 6. Estado y límites

- Los scripts están probados: la compuerta se ejecutó en sus tres modos y mutate.py tiene sus propias pruebas.
- **Los siete comandos todavía no se han usado en una tarea real.** Sus rutas y nombres se verificaron contra el repositorio, pero la primera tarea que se haga con `/tarea` mostrará qué les falta.
- Las mutaciones automáticas son solo del backend; la tienda usa la compuerta.
- La compuerta no sustituye al CI: el CI corre en GitHub solo al subir a `main`/`develop` o en un pull request.
