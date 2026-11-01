# Fase 1 (MVP)

> **Qué es:** la primera entrega de LibroYa: una tienda en la que una persona compradora, **con cuenta desde el inicio**, explora el catálogo, arma su carrito, paga con una pasarela simulada y consulta sus pedidos, sobre un backend completo. Está construida y verificada de punta a punta; lo que falta (el panel de administración y el cobro real) está descrito abajo.

## Qué incluye

| Parte | Qué hace | Estado |
|---|---|---|
| **Backend MVP** (`apps/main-api`) | Catálogo y búsqueda, compra con pago simulado, dirección de envío, administración de libros y stock, historial de pedidos, registro e inicio de sesión, cotización del total antes de pagar | Completo |
| **Tienda web MVP** (`apps/store-web`) | Registrarse, entrar, explorar el catálogo, armar el carrito, comprar, ver sus pedidos | Completa (cortes `F0`–`F6`) |
| **Panel de administración** | Crear y editar libros, cargar stock, consultar pedidos de un cliente | La API está hecha (HU-50 a HU-53); la pantalla de la tienda queda pendiente ([DP-03](../../product/09-decisiones-y-preguntas.md)) |

## Qué queda fuera de esta fase

Vendedores externos, cancelaciones y devoluciones, cupones y promociones, envíos y factura electrónica, suscripción a cliente premium, recuperar contraseña y verificar el correo, portada, descripción y categorías del libro, **stock visible** (pasa a la [fase 2](../fase-2/README.md)) y **pago real con tarjeta** (la pasarela es simulada, [DP-06](../../product/09-decisiones-y-preguntas.md)). La lista vigente y sus comentarios están en [`00-vision-y-alcance`](../../product/00-vision-y-alcance.md#fuera-de-alcance-por-ahora).

## Sus historias

Son las **20 historias** que se hicieron antes del 2026-10-30. Su texto está **congelado** en [`product/04-historias-de-usuario.md`](../../product/04-historias-de-usuario.md) y sus datos (tareas, fechas, tiempos aproximados) en [`legado.json`](../legado.json); por eso esta carpeta **no tiene archivos de historia**. Su estado está en la [matriz de la fase](matriz.md). Una ampliación de una de ellas es una historia nueva, en la fase en que se trabaje.

## De dónde salen los datos de `legado.json`

[`legado.json`](../legado.json) tiene las **20 historias** de esta fase, una entrada por historia, y **solo datos**: el comprobador (`python3 scripts/historias.py --check`) falla si le sobra un campo o un valor no es válido. Los datos **no se editan a mano para «mejorarlos»**: son una reconstrucción hecha el 2026-10-30, cuando se pasó de los cortes por capa a las historias.

**Cómo se calcularon.** Salen de `git log` (hora de Lima): `inicio` y `cierre` son las fechas del primer y el último commit de las tareas de la historia; `minutos` es la suma, por cada commit de esas tareas, del hueco con el commit anterior, con un **tope de 60** minutos por hueco para no contar noches ni pausas. Las tareas son las de los cortes del backend (`7.3`) y de la tienda (`F2.3`) que construyeron cada historia; **qué tarea corresponde a qué historia lo decidió Claude según lo que cada tarea construye**, y es auditable en el propio archivo.

**Es una aproximación.** Los cortes mezclaban varias historias, así que una tarea compartida (`compartidas`) se cuenta **completa en cada una** de las historias que la usan, y por eso los tiempos de la matriz llevan «≈». La suma de los tiempos de las 20 no es el tiempo total trabajado.

| Campo | Qué es |
|---|---|
| `id` | `HU-nn`; el mismo que en [`product/04`](../../product/04-historias-de-usuario.md), donde está el texto congelado de cada historia |
| `titulo` | Su título, igual que en `product/04` |
| `epica` | Una de las épicas del [diccionario](../plantillas/README.md#épicas-de-las-historias) |
| `api` y `web` | Cómo está esa capa: `✅` hecha, `⬜` pendiente o `—` no aplica (una historia solo de la tienda no tiene API) |
| `inicio` y `cierre` | Fechas `AAAA-MM-DD`; `cierre` es `null` si la historia sigue abierta, y entonces `api` o `web` es `⬜` (`HU-50` a `HU-53`: API hecha, tienda pendiente) |
| `minutos` | El tiempo aproximado, un entero |
| `tareas_api` y `tareas_web` | Los identificadores de las tareas de los cortes de cada capa |
| `compartidas` | Las de esas tareas que también cuentan para otra historia (siempre son de la propia entrada) |

El historial por cortes de esta fase está en [`docs/backend/00-avance.md`](../../backend/00-avance.md) y [`docs/frontend/00-avance.md`](../../frontend/00-avance.md) (congelados).
