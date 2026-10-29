# Frontend: tests

> Estrategia con Vitest (el de Vite+), Testing Library y MSW. Cada historia de [producto](../product/04-historias-de-usuario.md) se comprueba con al menos una prueba, y los criterios dado/cuando/entonces son los casos.

## Capas

| Capa | Qué prueba | Herramienta | Carpeta |
|---|---|---|---|
| **Unitarias** | Lógica pura: formato de montos, mapa de errores, huella y clave de idempotencia, reglas del carrito, reglas de dependencia | Vitest | `test/unit/` |
| **De componente** | Una pantalla o un flujo con su ruta, sus formularios y la API simulada | Vitest + Testing Library + MSW | `test/component/` |
| **Accesibilidad** | Que las pantallas no tengan violaciones de axe (nivel AA, [producto 08](../product/08-requisitos-de-experiencia.md)) | `axe-core` directo (`test/support/axe.ts`) dentro de las pruebas de componente; no mide el contraste, que jsdom no calcula y se audita en el navegador (F6) | `test/component/` |
| **e2e** | El recorrido completo contra el backend real | Playwright | `test/e2e/` (corte F6) |

Las pruebas viven en `test/`, no junto al código, como en el backend. `test/support/` tiene los handlers de MSW, una función `renderApp()` con los proveedores (router, Query, sesión) y fábricas tipadas con el esquema generado.

```bash
vp test                              # todas las unitarias y de componente (una corrida)
vp test watch                        # en observación mientras se desarrolla
vp test test/unit/money.test.ts      # un archivo
vp test -t "texto del test"          # un test por nombre
```

## La API simulada (MSW)

- Los handlers se tipan con el esquema generado (`schema.d.ts`), así que un cambio de contrato del backend rompe la compilación de las pruebas.
- El endpoint que **aún no existe** (`POST /orders/quote`, corte 8) tiene handlers que siguen el contrato propuesto y llevan el comentario `// CONTRATO PROPUESTO: aún no existe en el backend`. Una historia que depende de él **no se marca terminada** hasta probarla contra la ruta real ([00-avance](00-avance.md)).
- Cada prueba parte de un estado limpio de MSW y de `localStorage`/`sessionStorage`. Una petición sin handler falla la prueba (`onUnhandledFrame: "error"`).

## Casos mínimos, por funcionalidad

| Funcionalidad | Casos | Historias |
|---|---|---|
| **Montos** | `"1250.00"` → `S/ 1,250.00`; `"0.10"` y `"0.30"` se muestran intactos (importes que `number` redondea mal); `USD` con el código detrás; nunca se llama a `Number`/`parseFloat`/`toFixed` sobre un monto | RN-07, RN-08 |
| **Errores** | Cada `errorCode` de producto 07 tiene mensaje; un código desconocido da el genérico; el texto no sale de `message` del servidor; red caída y `5xx` en el pago **no** afirman que no se cobró | HU-33 |
| **Catálogo** | Lista inicial; búsqueda con `q` en la URL; sin resultados; paginación; estados de carga y error con "Reintentar"; libro inexistente o con ISBN inválido → "no disponible" | HU-10, HU-11 |
| **Registro y login** | Registro correcto inicia la sesión sola; `EMAIL_ALREADY_REGISTERED`, `WEAK_PASSWORD`, `INVALID_EMAIL` junto al campo; si el login automático falla, va a PA-04 con el correo escrito; `INVALID_CREDENTIALS` da un solo mensaje; el botón se deshabilita en curso | HU-01, HU-02 |
| **Sesión** | `401` → una renovación y se repite la petición; **varias peticiones simultáneas con `401` hacen una sola renovación**; la renovación guarda el token de refresco nuevo; `INVALID_REFRESH_TOKEN` limpia la sesión y va a PA-04 con `returnTo`; con dos "pestañas" simuladas, el candado serializa y la segunda lee el token ya rotado; cerrar sesión borra los dos tokens aunque la API falle | HU-02, HU-03, HU-04 |
| **Guardia de rutas** | Sin sesión, `/carrito` redirige a `/ingresar?returnTo=/carrito`; tras entrar vuelve; `returnTo` externo (`//otro.com`, `https://…`) se ignora; con sesión, `/ingresar` redirige | HU-02, HU-20 |
| **Carrito** | Agregar y sumar; tope de 10; moneda distinta no se agrega; cambiar y quitar con deshacer; un carrito por usuario (dos usuarios en el mismo navegador no se mezclan); se conserva al cerrar sesión; cambio de precio y libro desactivado al abrir PA-05 | HU-20, HU-21, HU-22 |
| **Cotización** | Muestra el subtotal de cada línea, el subtotal, el descuento, el envío y el total de la respuesta (sin calcular); recotiza al cambiar una cantidad; error → no se puede continuar | HU-22 |
| **Dirección** | Campos y largos de RN-22; `INVALID_SHIPPING_ADDRESS` junto al campo; empieza vacía en cada compra; se conserva al ir y volver al carrito | HU-30 |
| **Pago e idempotencia** | El cuerpo lleva solo ISBN y cantidad, la dirección y el `cardToken`; la huella normaliza ISBN y espacios; **misma clave** tras un corte, `5xx` y `CHECKOUT_IN_PROGRESS`; **clave nueva** tras `PREVIOUS_ATTEMPT_FAILED`, `IDEMPOTENCY_KEY_REUSED` o cambiar el carrito o la dirección; la clave sobrevive a una recarga y se borra tras el `201`; el botón no se puede pulsar dos veces; el `404` de cliente recién creado reintenta una vez con la misma clave | HU-31, HU-32 |
| **Confirmación** | Muestra el `charged` real (aunque difiera de la cotización); recargar muestra lo mismo; vacía solo el carrito del usuario | HU-34 |
| **Pedidos** | Lista del más reciente al más antiguo con `nextCursor` tal cual; vacío; detalle con precio **del momento de la compra**; pedido ajeno o inexistente y `id` que no es UUID → "no encontrado"; la sección de envío solo si viene `shippingAddress` | HU-40, HU-41 |
| **Dependencias** | Un archivo de `features/<x>` no importa las entrañas de otra; `shared/` no importa de `features/` ni `routes/`; solo `shared/api/` usa `fetch`; ni `openapi-fetch` ni el tipo `Response` se usan fuera de `shared/api/` y de los `api.ts`; los tipos de la API se importan de `shared/api/types.ts` y no de `schema.d.ts` | [01](01-decisiones-y-stack.md#3-arquitectura) |

## Reglas de dependencia

`test/unit/dependency-rules.test.ts` lee los imports de `src/` y falla si se rompe una regla de [01](01-decisiones-y-stack.md#3-arquitectura). Es la contraparte de `dependency-rules.spec.ts` del backend, con la misma idea: una comprobación mecánica en lugar de una convención que se olvida.

## e2e (corte F6)

Playwright contra el backend real levantado en local (PostgreSQL + `pnpm run start:dev`, con la pasarela y el correo simulados): registro → login → buscar → agregar → cotizar → pagar con `tok_ok` → confirmación → mis pedidos, y los caminos con `tok_declined` y sin stock. Es lo que comprueba el contrato contra la realidad, que MSW no puede.

### Playwright en WSL: faltan librerías del sistema

Chromium necesita `libnss3`, `libnspr4` y `libasound2` (`libasound2t64` en Ubuntu 24.04), que WSL no trae. Dos caminos:

- **Con permisos:** `sudo pnpm exec playwright install-deps chromium`.
- **Sin permisos de administrador** (el que se usó en F0): `apt-get download libnspr4 libnss3 libasound2t64`, descomprimir cada `.deb` con `dpkg-deb -x` en una carpeta local (por ejemplo `node_modules/.cache/visual/libs`) y lanzar el proceso con `LD_LIBRARY_PATH=<esa carpeta>/usr/lib/x86_64-linux-gnu`. No toca el sistema.

### Revisión visual contra los mockups

La revisión de F0 se hizo con un script de Playwright que no se guardó en el repositorio: abre la tienda con `vp dev` y el backend levantados, captura móvil (360 px) y escritorio (1024 px), abre las capturas de los [mockups](../product/diseno/mockups/index.html) con los mismos anchos y las compara. Se repite al construir cada pantalla (F1 en adelante).

