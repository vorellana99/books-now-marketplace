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
- Ya existen todas las rutas que usa la tienda (`POST /orders/quote` llegó con el corte 8). Los handlers de MSW de la cotización deben seguir la forma real de `api-contrato.md`; una historia **no se marca terminada** hasta probarla contra la ruta real ([00-avance](00-avance.md)).
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

Playwright contra el backend **real** (PostgreSQL + `pnpm run start:dev` en `:3000`, con la pasarela y el correo simulados, y los datos de `pnpm run db:seed`) y la tienda en `vp dev` (`:5173`, la levanta Playwright si no está). Es lo que comprueba el contrato contra la realidad, que MSW no puede.

```bash
# con el backend levantado
pnpm run test:e2e                       # todo (desde apps/store-web)
pnpm exec playwright test accessibility # un archivo
E2E_BASE_URL=http://localhost:4173 pnpm run test:e2e   # contra otra URL (por ejemplo `vp preview`); no levanta `vp dev`
```

**No están en la compuerta (`scripts/verify.sh`) ni en el CI**: necesitan el backend con su base de datos. Se corren a mano antes de cerrar un corte y al tocar el recorrido de compra. Los archivos son `test/e2e/*.e2e.ts` (para que Vitest no los recoja) y comparten `test/e2e/support/`:

- `api.ts`: prepara datos por la API real (comprador nuevo y listo para comprar, stock, un libro nuevo sin stock, un pedido hecho). Lo que se prueba por la pantalla se hace por la pantalla; esto solo deja el escenario listo.
- `browser.ts`: `signIn` y `violations` (axe con las reglas de WCAG 2.2 AA en el navegador real).
- `keyboard.ts`: `tabTo` recorre con `Tab` hasta un elemento por su nombre y anota si el foco se ve en cada parada.

**Contra el build de producción** (lo que se despliega): `vp build && vp preview --port 4173`, y luego `E2E_BASE_URL=http://localhost:4173 E2E_PRODUCTION_BUILD=1 pnpm run test:e2e`. `E2E_PRODUCTION_BUILD=1` avisa a las pruebas de que allí el selector de «Tarjeta de prueba» no se dibuja (solo existe fuera de producción): se omiten las que necesitan `tok_declined` y una prueba comprueba que el selector no está. Todo lo demás (el recorrido de compra con la tarjeta aprobada, el corte de red, la recarga de una ruta del cliente, la accesibilidad y el teclado) se ejecuta igual.

**El límite de intentos del backend** (`/auth/*`: 5 inicios de sesión por cuenta y 10 registros por dirección por minuto, `RATE_LIMIT_*`) también corre en los e2e. Por eso cada prueba crea su propio comprador y **planta su token de refresco una sola vez** en lugar de entrar por el formulario cada vez (el token se rota al usarse: plantarlo en cada navegación lo reutilizaría y la API revocaría la sesión), y `api.ts` espera el `Retry-After` de un `429` y repite. Si se quiere una tanda más rápida se puede levantar el backend con `RATE_LIMIT_LOGIN_IP`, `RATE_LIMIT_LOGIN_ACCOUNT` y `RATE_LIMIT_REGISTER_IP` altos.

**El recorrido de compra (`purchase.e2e.ts`, 6 pruebas)**, por la pantalla y comprobando después lo que la API guardó de verdad (`GET /me/orders`):

1. registro → buscar → agregar → cotizar (el total sale del backend: S/ 55.00 = 45.00 + envío) → pagar → confirmación (el «Total cobrado» es el cotizado y recargar lo conserva) → mis pedidos → detalle, y la API tiene un solo pedido con ese monto;
2. `tok_declined`: dice «No se te cobró nada.», la API no tiene ningún pedido, la dirección y el carrito siguen, y con «Probar con otra tarjeta» se compra;
3. falta de stock (un libro nuevo con 1 unidad y 2 en el carrito): lo dice sin cobrar, ofrece volver al carrito y no hay pedido;
4. **un corte de red con el pedido ya creado**: Playwright deja que la petición llegue al backend (`route.fetch()`) y corta la respuesta (`route.abort()`); la tienda dice «No pudimos confirmar tu pago» sin afirmar que no se cobró, «Reintentar» envía **la misma clave de idempotencia** y la API termina con **un solo pedido** (se comprobó que la prueba falla si el reintento usa una clave nueva);
5. el formulario de entrada (contraseña equivocada, y luego la correcta);
6. un pedido ajeno: la API y la tienda dicen que no existe.

**Accesibilidad (`accessibility.e2e.ts`, `keyboard.e2e.ts`)**: axe en el navegador real en las diez pantallas y en sus estados con error, a 360 px y a 1280 px; y el recorrido de compra completo (agregar, carrito, dirección, pago, confirmación, pedidos y detalle) **solo con teclado**, comprobando que el foco se ve en cada parada. En jsdom axe no calcula estilos, así que el contraste de color y el tamaño de los objetivos táctiles solo se comprueban aquí; las pruebas de componente siguen cubriendo el resto de reglas.

### Rendimiento (`pnpm run test:perf`)

`playwright.perf.config.ts` + `test/e2e/performance.perf.ts`. Mide el build de **producción** (`vp build` + `vp preview` en `:4173`, siempre uno nuevo: no reutiliza un servidor que ya estuviera) en un teléfono de gama media con 4G: CPU 4 veces más lenta y el perfil «4G lento» de Lighthouse (1.6 Mbps, 150 ms), el peor caso razonable. Necesita el backend real. `E2E_BASE_URL=<url>` mide un servidor que ya está en marcha (sirve para comparar dos builds). Objetivos de [producto 08](../product/08-requisitos-de-experiencia.md) y lo medido en F6.3:

| Indicador | Objetivo | Medido (peor perfil) |
|---|---|---|
| LCP del catálogo | ≤ 2.5 s | 1.9–2.0 s (0.73 s con una 4G típica de 9 Mbps) |
| CLS | ≤ 0.1 | 0.001 |
| INP en el recorrido de compra (buscar, agregar, carrito, cantidad, continuar, escribir la dirección) | ≤ 200 ms | 48–80 ms |
| JS y CSS iniciales sin comprimir | ≤ 700 kB (presupuesto) | 647 kB |

Solo se baja el subconjunto latino de las tipografías (la prueba lo exige). `vp preview` no comprime: en producción el proxy inverso debe servir `gzip` o `br` (ver el [README de la tienda](../../apps/store-web/README.md#despliegue)).

**Qué se corrigió**: la interacción más lenta era tocar «Continuar con la compra» o el carrito (232–256 ms): el trozo de la ruta se pedía recién al tocar y esperaba a la red. `src/app/preload.ts` precarga `/carrito`, `/compra` y `/pedidos` en un momento libre tras el primer pintado (`requestIdleCallback`, con un temporizador en Safari) y la interacción baja a 56–64 ms. Se comprobó con un A/B de dos builds servidos a la vez (con y sin precarga, 5 corridas cada uno: 56–64 ms contra 240–256 ms) y la prueba de INP falla sobre el build sin precarga.

### Playwright en WSL: faltan librerías del sistema

Chromium necesita `libnss3`, `libnspr4` y `libasound2` (`libasound2t64` en Ubuntu 24.04), que WSL no trae. Dos caminos:

- **Con permisos:** `sudo pnpm exec playwright install-deps chromium`.
- **Sin permisos de administrador** (el que se usó en F0): `apt-get download libnspr4 libnss3 libasound2t64`, descomprimir cada `.deb` con `dpkg-deb -x` en una carpeta local (por ejemplo `node_modules/.cache/visual/libs`) y lanzar el proceso con `LD_LIBRARY_PATH=<esa carpeta>/usr/lib/x86_64-linux-gnu`. No toca el sistema.

### Revisión visual contra los mockups

La revisión de F0 se hizo con un script de Playwright que no se guardó en el repositorio: abre la tienda con `vp dev` y el backend levantados, captura móvil (360 px) y escritorio (1024 px), abre las capturas de los [mockups](../product/diseno/mockups/index.html) con los mismos anchos y las compara. Se repite al construir cada pantalla (F1 en adelante).

