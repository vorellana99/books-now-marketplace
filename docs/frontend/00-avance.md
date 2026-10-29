# Frontend: control de avance

> Seguimiento de la implementación de `apps/store-web` según los cortes de [07-fases-y-roadmap](07-fases-y-roadmap.md). Se actualiza en cada commit que avance una tarea: marca la casilla, anota lo que cambió respecto a la guía y deja una línea en la [bitácora](#bitácora).

**Leyenda:** ⬜ pendiente · 🔄 en curso · ✅ hecho · ⛔ bloqueado

Cada corte trae un cuadro de **Tareas** que explica qué es cada una y para qué sirve; debajo queda la lista de casillas con lo que se comprueba. Los commits de cada tarea llevan su número (`F0.1`, `F3.2`…), como los del backend. **Cada tarea cita la historia (`HU-nn`) que cumple**, de [producto](../product/04-historias-de-usuario.md).

## Resumen

| # | Corte | Historias | Estado | Rama | PR |
|---|---|---|---|---|---|
| F0 | Fundaciones | — | ⬜ | `feature/frontend-mvp` | — |
| F1 | Catálogo | HU-10, HU-11 | ⬜ | `feature/frontend-mvp` | — |
| F2 | Cuenta y sesión | HU-01 a HU-04 | ⬜ | `feature/frontend-mvp` | — |
| F3 | Carrito | HU-20 a HU-22 | ⬜ | `feature/frontend-mvp` | — |
| F4 | Compra | HU-30 a HU-34 | ⬜ ⛔ | `feature/frontend-mvp` | — |
| F5 | Pedidos | HU-40, HU-41 | ⬜ ⛔ | `feature/frontend-mvp` | — |
| F6 | Calidad y salida | — | ⬜ | `feature/frontend-mvp` | — |

F1 y F2 son independientes entre sí y pueden ir en paralelo tras F0. Del F3 en adelante cada corte depende del anterior. **F4 y F5 se pueden construir contra la API simulada (MSW), pero quedan ⛔ para cerrarse** hasta que el backend entregue `7.7`, el corte 8 y `7.8` ([07-fases-y-roadmap](07-fases-y-roadmap.md)). Una sola rama de trabajo, `feature/frontend-mvp`; el pull request lo abre el usuario cuando lo decida.

**Un corte está terminado cuando:** sus tareas están marcadas, `vp check`, `vp test` y `vp build` pasan, sus criterios de "listo cuando…" se cumplen ejecutándolos de verdad (en el navegador y contra la API real, no solo con MSW), y la guía y [producto](../product/04-historias-de-usuario.md) reflejan lo que realmente se hizo (el estado **Web** de cada historia).

---

## Corte F0: Fundaciones ⬜

**Guía:** [01-decisiones-y-stack](01-decisiones-y-stack.md) · [02-estructura-y-puesta-en-marcha](02-estructura-y-puesta-en-marcha.md) · [03-integracion-con-la-api](03-integracion-con-la-api.md) · [06-tests](06-tests.md)

**Listo cuando:** con el backend levantado, `vp dev` muestra el layout con su cabecera y la pantalla de "no encontrado" (PA-10); una llamada del cliente a `/api/health/live` responde `200` por el proxy; el cliente tiene los tipos generados del contrato; `vp check`, `vp test` y `vp build` pasan, también en el CI; y la regla de dependencias se comprueba con una prueba.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Reemplazar la plantilla | Sustituir el contador de TypeScript vanilla por una app React: `main.tsx`, `index.html` con `lang="es"`, `tsconfig` con `jsx` y el alias `@/*`; borrar `counter.ts`, los recursos y el estilo de la plantilla | Partir de una app real y no de un ejemplo | ⬜ |
| 2 | Dependencias y configuración | React 19, Tailwind 4, shadcn/ui, TanStack Router y Query, Zustand, React Hook Form y Zod, con versión exacta; plugins en `vite.config.ts`, proxy `/api` y variables `VITE_*` validadas | Tener instalado y configurado el stack, sin tocar lo que ya hace Vite+ | ⬜ |
| 3 | Cliente de API y utilidades | Script `api:types`, `schema.d.ts`, el cliente con sus tres comportamientos, `ApiError`, el mapa de errores vacío, y formato de montos y fechas | Que toda llamada a la API tenga tipos y un manejo de errores único | ⬜ |
| 4 | Layout y estados base | Ruta raíz con cabecera, componentes de cargando, vacío, error y no encontrado, y PA-10 | Que cada pantalla futura reutilice los mismos estados | ⬜ |
| 5 | Pruebas | Vitest con Testing Library, MSW, `renderApp`, axe y la prueba de reglas de dependencia | Poder probar cada historia desde la primera | ⬜ |
| 6 | Integración continua | Workflow `store-web.yml` que repite `vp check`, `vp test` y `vp build` en un entorno limpio | Detectar lo que solo funciona en una máquina | ⬜ |

- [ ] F0.1 Reemplazo de la plantilla. Se comprueba: `vp dev` arranca una app React, `index.html` está en español, y no queda código ni estilo de la plantilla
- [ ] F0.2 Dependencias, configuración y entorno. Se comprueba: el proxy reenvía `/api/*` al backend sin el prefijo, la app no arranca si una variable obligatoria falta, y las versiones instaladas son exactas (`-E`)
- [ ] F0.3 Cliente de API, tipos y utilidades. Se comprueba: `vp run api:types` genera el esquema desde el backend levantado; los montos `"0.10"` y `"1250.00"` se formatean sin pasar por `number`; un `ApiError` conserva `errorCode` y `requestId`
- [ ] F0.4 Layout y estados base. Se comprueba: los cuatro estados son componentes reutilizables y accesibles, y una ruta inexistente muestra PA-10
- [ ] F0.5 Pruebas y reglas de dependencia. Se comprueba: una prueba de componente con MSW y axe pasa, y la prueba de dependencias falla si una funcionalidad importa las entrañas de otra o `shared/` importa de `features/`
- [ ] F0.6 CI. Se comprueba: el workflow corre en un pull request y falla si falla cualquiera de los tres comandos

---

## Corte F1: Catálogo ⬜

**Historias:** [HU-10, HU-11](../product/04-historias-de-usuario.md#catálogo) · **Pantallas:** PA-01, PA-02 · **Guía:** [04-flujos-de-pantalla](04-flujos-de-pantalla.md)

**Listo cuando:** contra el backend real con datos del seed, una persona sin sesión busca por título o autor, pagina, abre un libro y ve su precio; la búsqueda y la página viven en la URL y se pueden compartir; un libro inexistente o con ISBN inválido muestra "no disponible"; y las pantallas pasan las pruebas de accesibilidad.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Consultas del catálogo | Hooks `books.search` y `books.detail` sobre el cliente, con sus claves | Un solo punto de acceso a los libros | ⬜ |
| 2 | PA-01 Catálogo y búsqueda | Lista de 20 en 20, buscador de la cabecera y paginación, con `q` y `page` validados en la URL | HU-10 | ⬜ |
| 3 | PA-02 Detalle del libro | Título, autor, ISBN y precio con su moneda, y el botón "Agregar al carrito" (aún sin efecto) | HU-11 | ⬜ |
| 4 | Estados y accesibilidad | Cargando, vacío, error con reintentar y no encontrado en ambas pantallas | Cumplir los cinco estados de [producto 06](../product/06-pantallas-y-navegacion.md) | ⬜ |

- [ ] F1.1 Hooks de catálogo. Se comprueba: `search` pide `page` y `pageSize` correctos; `detail` acepta el ISBN con o sin guiones
- [ ] F1.2 PA-01. Se comprueba: HU-10 (lista inicial, búsqueda sin distinguir mayúsculas ni acentos, sin resultados con "limpiar búsqueda", paginación con total, estados de carga y error); `q` y `page` inválidos en la URL se corrigen
- [ ] F1.3 PA-02. Se comprueba: HU-11 (libro activo; `NOT_FOUND` e `INVALID_ISBN` dan el mismo "no disponible"); no se muestra stock
- [ ] F1.4 Estados y accesibilidad. Se comprueba: axe sin violaciones AA en PA-01 y PA-02, navegación completa con teclado y foco visible

---

## Corte F2: Cuenta y sesión ⬜

**Historias:** [HU-01 a HU-04](../product/04-historias-de-usuario.md#cuenta) · **Pantallas:** PA-03, PA-04 · **Guía:** [03 sección 4](03-integracion-con-la-api.md#4-sesión-tokens-y-renovación) · [05-piezas-clave](05-piezas-clave.md)

**Listo cuando:** una persona se registra y queda con sesión iniciada sola; entra y sale; recarga la página y sigue con sesión; cuando su token de acceso vence se renueva sin que lo note; con varias peticiones o varias pestañas a la vez **no se cierra la sesión por reutilizar el token de refresco**; y una ruta con sesión lleva a iniciar sesión y devuelve a donde estaba.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Sesión y renovación | Token de acceso en memoria, de refresco en `localStorage`, una renovación a la vez por pestaña y un candado entre pestañas | Que ninguna combinación de pestañas y peticiones dispare la detección de reutilización | ⬜ |
| 2 | PA-04 Iniciar sesión | Formulario, `INVALID_CREDENTIALS` con un solo mensaje y vuelta al origen | HU-02 | ⬜ |
| 3 | PA-03 Registrarse | Formulario con `EMAIL_ALREADY_REGISTERED`, `WEAK_PASSWORD` y `INVALID_EMAIL`, e inicio de sesión automático | HU-01 | ⬜ |
| 4 | Guardia de rutas y `returnTo` | `beforeLoad` en las rutas con sesión, y `returnTo` que solo acepta rutas internas | Que ninguna ruta con sesión se vea sin ella, ni se pueda redirigir a un sitio ajeno | ⬜ |
| 5 | Menú de cuenta y cerrar sesión | Cabecera con "Entrar" o el menú de la cuenta, y cierre que borra tokens y caché | HU-04 | ⬜ |

- [ ] F2.1 Sesión y renovación. Se comprueba: `401` → una renovación y se repite la petición; varias peticiones simultáneas con `401` hacen **una** renovación; dos "pestañas" simuladas se serializan con el candado y la segunda lee el token ya rotado; `INVALID_REFRESH_TOKEN` limpia la sesión; al arrancar con un token de refresco guardado se renueva antes de mostrar rutas con sesión
- [ ] F2.2 PA-04. Se comprueba: HU-02 (credenciales correctas, incorrectas con un solo mensaje, sesión que sigue tras recargar), el botón se deshabilita en curso
- [ ] F2.3 PA-03. Se comprueba: HU-01 (cuenta creada e inicio automático; si el inicio automático falla, va a PA-04 con el correo escrito; los tres errores junto al campo)
- [ ] F2.4 Guardia y `returnTo`. Se comprueba: sin sesión, `/carrito` va a `/ingresar?returnTo=/carrito` y tras entrar vuelve; `returnTo=//otro.com` y `https://…` se ignoran; con sesión, `/ingresar` y `/registro` redirigen
- [ ] F2.5 Cierre de sesión. Se comprueba: HU-04 (borra los dos tokens aunque la API falle, vacía la caché de consultas, el carrito **se conserva**)

---

## Corte F3: Carrito ⬜

**Historias:** [HU-20, HU-21, HU-22](../product/04-historias-de-usuario.md#carrito) (HU-22 sin totales hasta F4) · **Pantallas:** PA-05 · **Guía:** [04 sección 4](04-flujos-de-pantalla.md#4-carrito)

**Listo cuando:** una persona con sesión agrega libros desde el catálogo y el detalle, cambia cantidades, quita libros y ve su carrito, que sobrevive a recargar y a cerrar sesión y no se mezcla con el de otra cuenta del mismo equipo; los topes (10 por libro, una sola moneda) se avisan; y un precio cambiado o un libro desactivado se detecta al abrir el carrito. **Los totales llegan en F4** con la cotización.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Almacén del carrito | Zustand con `persist`, un mapa por usuario, y las reglas de tope y de moneda | HU-20, HU-21 | ⬜ |
| 2 | Agregar al carrito | El botón de PA-01 y PA-02, con el aviso sin sesión ("Entra para armar tu carrito") | HU-20 | ⬜ |
| 3 | PA-05 Carrito | Líneas, cantidad de 1 a 10, quitar con deshacer y estado vacío | HU-21, HU-22 | ⬜ |
| 4 | Revalidar al abrir | Reconsultar cada libro para detectar cambio de precio o desactivación | HU-22 | ⬜ |

- [ ] F3.1 Almacén. Se comprueba: agregar y sumar; tope de 10 (RN-10); moneda distinta no entra (RN-05); un carrito por usuario; sobrevive a recargar y a cerrar sesión
- [ ] F3.2 Agregar. Se comprueba: HU-20 (con sesión entra con cantidad 1 y se confirma; sin sesión va a PA-04 y tras entrar vuelve al libro **sin** agregarlo solo, DP-12)
- [ ] F3.3 PA-05. Se comprueba: HU-21 y la parte de HU-22 sin totales (líneas con título, autor, precio unitario y cantidad); el carrito vacío tiene su estado
- [ ] F3.4 Revalidación. Se comprueba: un precio cambiado se actualiza y se avisa; un libro desactivado se marca "no disponible" y no deja continuar

---

## Corte F4: Compra ⬜ ⛔

**Historias:** [HU-30 a HU-34](../product/04-historias-de-usuario.md#compra) y HU-22 completa · **Pantallas:** PA-06, PA-07 · **Guía:** [04 sección 5](04-flujos-de-pantalla.md#5-pago-pa-06) · [03 sección 5](03-integracion-con-la-api.md#5-idempotencia-de-la-compra)

**Bloqueo para cerrarse:** corte 8 del backend (cotización) y `7.7` (compra con el cliente del token).

**Listo cuando:** contra el backend real, una persona con sesión ve su total antes de pagar, escribe su dirección, paga con una tarjeta simulada y ve la confirmación con el total realmente cobrado; **un reintento tras un corte de red no cobra dos veces**; cada fallo de negocio (sin stock, tarjeta rechazada, dirección inválida) muestra su mensaje y dice si se cobró; y el cuerpo de `POST /orders` ya no lleva `customerId`.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Cotización | Hook de `POST /orders/quote`; totales en PA-05 y el resumen de PA-06 | HU-22 completa | ⬜ ⛔ |
| 2 | Formulario de dirección | RN-22, con errores del servidor junto al campo; vacío en cada compra | HU-30 | ⬜ |
| 3 | Idempotencia y máquina de pago | Huella del intento, clave en `sessionStorage` y los estados `Cotizando`…`Confirmado` | HU-31, HU-32 | ⬜ |
| 4 | Errores de la compra | Un mensaje por `errorCode` con su acción, y "no se pudo confirmar" sin afirmar que no se cobró | HU-33 | ⬜ |
| 5 | PA-07 Confirmación | Número de pedido, libros, `charged` real y aviso del email | HU-34 | ⬜ |
| 6 | Quitar `customerId` | Dejar de enviar el cliente cuando llegue `7.7` | Cumplir RN-23 y DP-09 | ⬜ ⛔ |

- [ ] F4.1 Cotización. Se comprueba: HU-22 (subtotal de cada línea, subtotal, descuento, envío y total de la respuesta, sin calcular nada; recotiza al cambiar una cantidad; si falla no se puede continuar). **No se cierra** hasta probarla contra la ruta real del corte 8
- [ ] F4.2 Dirección. Se comprueba: HU-30 (campos y largos, `INVALID_SHIPPING_ADDRESS` junto al campo, espacios recortados, empieza vacía, se conserva al ir y volver al carrito)
- [ ] F4.3 Idempotencia y pago. Se comprueba: HU-31 y HU-32 (misma clave tras corte, `5xx` y `CHECKOUT_IN_PROGRESS`; clave nueva tras `PREVIOUS_ATTEMPT_FAILED`, `IDEMPOTENCY_KEY_REUSED` o un cambio; la clave sobrevive a una recarga; el botón no se pulsa dos veces; el `404` de cliente recién creado reintenta una vez)
- [ ] F4.4 Errores. Se comprueba: HU-33 (cada código de [producto 07](../product/07-contenido-y-mensajes.md) tiene mensaje; red caída y `5xx` no afirman que no se cobró; una sesión vencida a mitad del pago se renueva y se reenvía con la misma clave)
- [ ] F4.5 Confirmación. Se comprueba: HU-34 (muestra el `charged` aunque difiera de la cotización; recargar muestra lo mismo; vacía solo el carrito del usuario)
- [ ] F4.6 Sin `customerId`. Se comprueba: el cuerpo de `POST /orders` no lo incluye y la compra funciona contra la API real

---

## Corte F5: Pedidos ⬜ ⛔

**Historias:** [HU-40, HU-41](../product/04-historias-de-usuario.md#pedidos) · **Pantallas:** PA-08, PA-09

**Bloqueo para cerrarse:** `7.8` (`GET /me/orders`) y `7.7` (el pedido solo para su dueño y, con DP-15, con su dirección).

**Listo cuando:** una persona ve sus pedidos del más reciente al más antiguo, con paginación por cursor, y abre cada uno con el precio de la compra; un pedido ajeno o inexistente muestra "no encontrado"; y la dirección aparece cuando la API la devuelve.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | PA-08 Mis pedidos | Lista paginada con `nextCursor` tal cual, con la forma de DP-18 | HU-40 | ⬜ ⛔ |
| 2 | PA-09 Detalle del pedido | Estado, total, líneas con el precio del momento y, si viene, la sección de envío | HU-41 | ⬜ |

- [ ] F5.1 Mis pedidos. Se comprueba: HU-40 (orden, cursor, vacío). **No se cierra** hasta probarla contra `GET /me/orders`
- [ ] F5.2 Detalle. Se comprueba: HU-41 (pedido propio; ajeno, inexistente y `id` no UUID dan el mismo "no encontrado"; la dirección solo si `shippingAddress` no es `null`)

---

## Corte F6: Calidad y salida ⬜

**Guía:** [06-tests](06-tests.md) · [producto 08](../product/08-requisitos-de-experiencia.md) · [02 sección 3](02-estructura-y-puesta-en-marcha.md#3-variables-de-entorno)

**Bloqueo para la salida a producción:** `7.7`, `7.8` y `7.10` del backend (DP-09).

**Listo cuando:** el recorrido completo (registro → compra → pedidos) pasa con Playwright contra el backend real; las pantallas pasan axe en nivel AA y se usan solo con teclado; el rendimiento cumple los objetivos de [producto 08](../product/08-requisitos-de-experiencia.md) en un teléfono de gama media; el frontend queda desplegable con su configuración de producción; y la revisión de seguridad está hecha.

### Tareas

| # | Tarea | Qué es | Objetivo principal | Estado |
|---|---|---|---|---|
| 1 | Auditoría de accesibilidad | Teclado, foco, contraste y lector de pantalla en las diez pantallas | Cumplir WCAG 2.2 AA | ⬜ |
| 2 | e2e con Playwright | El recorrido completo y los caminos con `tok_declined` y sin stock | Comprobar el contrato contra la realidad, que MSW no puede | ⬜ |
| 3 | Rendimiento | Medir LCP, INP y CLS y corregir; carga por rutas | Cumplir los objetivos de producto 08 | ⬜ |
| 4 | Despliegue | Compilación estática, proxy inverso al mismo origen (o CORS) y README del frontend | Poder publicar la tienda | ⬜ |
| 5 | Revisión de seguridad | Tokens, `returnTo`, cabeceras (CSP), dependencias y que ningún secreto ni dato personal salga en logs o analítica | Que la tienda no filtre lo que el producto promete proteger | ⬜ |

- [ ] F6.1 Accesibilidad. Se comprueba: axe sin violaciones AA en todas las pantallas y el recorrido de compra completo solo con teclado
- [ ] F6.2 e2e. Se comprueba: registro → buscar → agregar → cotizar → pagar → confirmación → mis pedidos, `tok_declined` sin cobro y falta de stock
- [ ] F6.3 Rendimiento. Se comprueba: LCP ≤ 2.5 s, INP ≤ 200 ms y CLS ≤ 0.1 en un teléfono de gama media con 4G
- [ ] F6.4 Despliegue. Se comprueba: `vp build` + `vp preview` sirven la tienda y llegan a la API por el mismo origen; las variables de producción están documentadas
- [ ] F6.5 Seguridad. Se comprueba: el token de acceso no aparece en `localStorage`, la URL ni los logs; el token de refresco se borra al cerrar sesión; no hay `dangerouslySetInnerHTML` con datos de la API; `pnpm audit --prod` limpio

---

## Decisiones y desvíos respecto a la guía

Cuando la implementación se aparte de la guía, se anota aquí y se corrige la guía en el mismo commit.

| Fecha | Corte | Qué cambió | Por qué |
|---|---|---|---|
| 2026-10-29 | Plan | Stack confirmado: React 19, TanStack Router y Query, openapi-typescript + openapi-fetch, React Hook Form + Zod 4, Zustand, Tailwind 4 + shadcn/ui, Vitest + Testing Library + MSW. Detalle en [01](01-decisiones-y-stack.md) | Armoniza con Vite+ (Oxlint, Oxfmt, Vitest ya incluidos) y con las decisiones de producto |
| 2026-10-29 | Plan | El subtotal de cada línea del carrito llega en la cotización y no se calcula en el frontend (DP-20) | Cumplir RN-08 y HU-22; el backend añadió `lines` al contrato del corte 8 |
| 2026-10-29 | Plan | Las pruebas viven en `test/` y no junto al código | Mismo criterio que el backend |
| 2026-10-29 | Plan | Los imports llevan la extensión del archivo, como en la plantilla | Coherencia con el código existente; el CLI de shadcn genera imports sin extensión y se ajustan al añadir cada componente |

## Problemas abiertos

| # | Problema | Opciones | Estado |
|---|---|---|---|
| 1 | HU-22 pide el subtotal de cada línea y RN-08 prohíbe calcular montos en el frontend | Se eligió que la cotización devuelva `lines[{ isbn, unitPrice, quantity, subtotal }]` (DP-20) y se actualizó el corte 8 del backend. Hasta que exista, PA-05 muestra precio unitario y cantidad | ✅ Decidido; se cierra con F4.1 |
| 2 | Los candados entre pestañas usan Web Locks (`navigator.locks`) | Navegadores a cubrir: las dos últimas versiones de los principales (producto 08), que lo soportan | ✅ Sin acción |
| 3 | La compra recién registrada puede dar `404 NOT_FOUND` mientras se crea el cliente de Ventas | Reintento único con la misma clave (HU-31) | ✅ Decidido; se prueba en F4.3 |

## Bitácora

| Fecha | Qué se hizo |
|---|---|
| 2026-10-29 | Plan del frontend (`F0`–`F6`): siete cortes con su cuadro de tareas, ligados a las historias de [producto](../product/04-historias-de-usuario.md) y a las dependencias del backend (`7.7`, `7.8`, `7.10` y el corte 8). Estado comprobado antes de planificar: `apps/store-web` es la plantilla de Vite+ en TypeScript vanilla (un contador que arma el HTML con `innerHTML`), con Vite+ 1.4.0, TypeScript 6 estricto en la forma (`erasableSyntaxOnly`, `verbatimModuleSyntax`, lint con tipos), sin framework, sin rutas, sin cliente de API y sin pruebas |
