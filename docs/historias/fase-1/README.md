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

Son las **20 historias** que se hicieron antes del 2026-10-30. Su texto está **congelado** en [`product/04-historias-de-usuario.md`](../../product/04-historias-de-usuario.md) y sus datos (tareas, fechas, tiempos aproximados) en [`legado.json`](../legado.json); por eso esta carpeta **no tiene archivos de historia**. Aparecen en la [matriz](../README.md#matriz) con «Fase 1». Una ampliación de una de ellas es una historia nueva, en la fase en que se trabaje.

El historial por cortes de esta fase está en [`docs/backend/00-avance.md`](../../backend/00-avance.md) y [`docs/frontend/00-avance.md`](../../frontend/00-avance.md) (congelados).
