# Decisiones y preguntas abiertas

> Registro de las decisiones de producto (`DP-nn`). Si una pregunta está **Abierta**, quien implemente no inventa la respuesta: se decide aquí primero y se actualiza el documento afectado.

**Estados:** ✅ Decidida · 🟡 Abierta con propuesta · ⬜ Abierta sin propuesta

Los números identifican el tema y no cambian; no siguen el orden en que se decidió.

## Decididas

| ID | Decisión | Elegida | Afecta a |
|---|---|---|---|
| DP-01 | Nombre y ubicación de esta carpeta | `docs/product/`, al nivel de `backend/` y `frontend/` | Toda la documentación |
| DP-02 | Cuenta obligatoria | La persona necesita cuenta **desde el inicio**: el visitante solo explora el catálogo; armar el carrito y comprar exigen sesión. Se descartó el carrito anónimo | HU-20, HU-22, PA-05, [05](05-recorridos.md) |
| DP-03 | Alcance de la tienda web MVP | Tienda pública con cuenta (catálogo, carrito, compra, pedidos). El **panel de administración** queda para una segunda etapa | [00](00-vision-y-alcance.md), HU-50 a HU-53 |
| DP-04 | Dónde vive el carrito | **En el navegador** (`localStorage`), ligado al `id` del usuario, sin tocar la API. Sobrevive a cerrar sesión y a recargar. Se descartó el carrito en el servidor | HU-20 a HU-22, PA-05 |
| DP-05 | Datos del libro | El MVP usa solo lo que entrega la API: ISBN, título, autor y precio. Portada, descripción, categorías y stock visible quedan como pendientes de API | PA-01, PA-02 |
| DP-06 | Pago con tarjeta | El frontend usa un `cardToken` simulado hasta que se elija proveedor. Con la pasarela simulada, `tok_declined` da rechazo, `tok_error` da un error del servidor y cualquier otro token se aprueba | HU-31 |
| DP-07 | Total antes de pagar | El backend ofrece una **cotización** (`POST /orders/quote`) que calcula subtotal, descuento, envío y total sin cobrar ni reservar. La tienda la muestra en el carrito y en el pago. El frontend **no** calcula precios (RN-08) | HU-22, HU-31, PA-05, PA-06, [03](03-reglas-de-negocio.md) |
| DP-08 | SEO | No es prioridad del MVP: la tienda puede seguir siendo una SPA (Vite+) | [08](08-requisitos-de-experiencia.md) |
| DP-09 | Salida a producción | La tienda se abre al público al cerrar `7.7` (compra con el cliente del token), `7.8` (`GET /me/orders`) y `7.10` (límites de intentos y CORS). **Las tres están hechas** (corte 7 cerrado); también `7.9`, así que la administración funciona en producción, solo para el rol `ADMIN`. Queda la cotización (corte 8) para el paso de pago | [00](00-vision-y-alcance.md) |
| DP-10 | Distintivo premium | No se muestra si la persona es premium en el MVP | PA-05 |
| DP-11 | Tras registrarse | La tienda inicia la sesión sola con las mismas credenciales | HU-01 |
| DP-12 | Intención al pedir sesión | No se recuerda: tras entrar se vuelve al libro y la persona lo agrega | HU-20, [05](05-recorridos.md) |
| DP-13 | Dirección de envío | **No se recuerda**: se escribe en cada compra. La API no guarda direcciones y la tienda tampoco las guarda en el navegador | HU-30 |
| DP-14 | `Idempotency-Key` del intento en curso | Se guarda en `sessionStorage`, hasta confirmar la compra o hasta que cambie el carrito o la dirección | HU-32 |
| DP-15 | Dirección en el detalle del pedido | **Por decidir.** Se esperaba que `GET /orders/:id` devolviera la dirección y el teléfono a su dueño cuando `7.7` lo limitara a su dueño o a un administrador. El backend lo limitó, pero **mantuvo** que ese endpoint no los devuelva (`{ id, status, charged, lines }`); la dirección va en cada ítem de `GET /me/orders`. Opciones: (A) el backend añade `shippingAddress` al detalle para su dueño y los administradores (un cambio pequeño y coherente con la intención original), (B) PA-09 la toma del pedido de la lista cuando se llega desde PA-08 y no la muestra si no, (C) no se muestra en el detalle | HU-41, PA-09 |
| DP-16 | Tokens de la sesión | Token de acceso **en memoria** y token de refresco en **`localStorage`**: la sesión sobrevive a cerrar el navegador y el token corto no persiste | HU-02, HU-03, [08](08-requisitos-de-experiencia.md) |
| DP-17 | Proveedores reales de pago y de email | El MVP sigue con los simulados. La elección de proveedor se decide después; el frontend queda preparado para cambiar el `cardToken` | HU-31, RN-25 |
| DP-18 | Forma de `GET /me/orders` | La misma de cada ítem del historial actual (`id`, `status`, `charged`, `lines`, `createdAt`, `shippingAddress`) y el mismo cursor: un solo contrato para el comprador y el administrador | HU-40 |
| DP-19 | Diseño y experiencia | No hay marca ni Figma. Se parte de móvil primero, un solo idioma (`es-PE`) y accesibilidad AA; se pueden modificar | [08](08-requisitos-de-experiencia.md) |
| DP-20 | Subtotal de cada línea | Lo calcula el backend y llega en la cotización (`lines[…].subtotal`); el frontend nunca multiplica precio por cantidad (RN-08). Se descartó mostrar solo precio unitario y cantidad | HU-22, PA-05, [corte 8](../backend/00-avance.md#corte-8-cotización-del-total-) |
| DP-21 | Dónde viven los diseños | En [`docs/product/diseno/`](diseno/README.md): tokens, componentes, la descripción de las diez pantallas y mockups HTML con los tokens reales. La interfaz se construye directamente con shadcn/ui y Tailwind a partir de eso; sin Figma por ahora | [diseno](diseno/README.md) |
| DP-22 | Dirección visual y modo | **Librería editorial y cálida**: fondo crema, texto casi negro, un solo acento granate y títulos en serif. **Solo modo claro** en el MVP; los colores son variables, así que el oscuro se añade después sin tocar los componentes | [diseno](diseno/README.md), [01-tokens](diseno/01-tokens.md) |
| DP-23 | Cuándo se diseña | Lo mínimo antes de `F0` (tokens y cabecera); cada pantalla se **revisa** justo antes de construirla en su corte | [diseno](diseno/README.md#cuándo-se-diseña) |
| DP-24 | Identidad de marca | No hay marca. La paleta, la tipografía (`Source Serif 4` e `Inter`) y el tono son una **propuesta modificable**; si llega una marca real solo cambian los valores de los tokens y el logotipo | [01-tokens](diseno/01-tokens.md) |

## Abiertas

Ninguna que bloquee el MVP. Lo que sigue pendiente es de otra naturaleza:

| ID | Pendiente | Cuándo |
|---|---|---|
| DP-17 | Elegir el proveedor real de pagos y de email | Antes de cobrar dinero real |
| DP-10 | Mostrar si la persona es premium, si el negocio lo pide | Si se activa una forma de suscribirse |

## Pendientes de API que el producto necesita

Cosas que la tienda web necesita y que el backend no ofrece hoy. La columna **Bloquea** dice qué impide si no están.

| Necesidad | Hoy | Bloquea |
|---|---|---|
| Compra con el cliente tomado del token y pedido visible solo para su dueño | ✅ Tarea `7.7` (hecha) | — |
| Dirección y teléfono en el detalle del pedido (DP-15) | **Por decidir.** Hoy solo vienen en `GET /me/orders` | La sección de envío de HU-41 |
| `GET /me/orders`, con la forma de DP-18 | ✅ Tarea `7.8` (hecha) | — |
| Límite de intentos y CORS (`CORS_ORIGINS`) | ✅ Tarea `7.10` (hecha; `CORS_ORIGINS` vacío por defecto: hay que configurarlo en el despliegue o usar un proxy) | — |
| **Cotización del total** (`POST /orders/quote`), ver abajo | No existe. Es el [corte 8 del backend](../backend/00-avance.md#corte-8-cotización-del-total-) (`8.1` a `8.4`); su dependencia, `7.7`, ya está hecha | **HU-22 y el paso de pago** (DP-07) |
| Roles en `/admin/*` | ✅ Tarea `7.9` (hecha) | — |
| Portada, descripción y categorías del libro | No existen | No |
| Stock visible o "últimas unidades" | La API no lo expone | No |
| Distintivo premium (que el usuario traiga `premium`) | `user` solo trae `id`, `email` y `role` | No (DP-10) |
| Recuperar o cambiar la contraseña, verificar el correo | Fuera del corte 7: no existe | No |

### Contrato propuesto de la cotización

Es una **propuesta** para que backend y frontend la afinen antes de implementarla:

- `POST /orders/quote`, con sesión (el descuento premium depende del cliente del token).
- Cuerpo: `items[{ isbn, quantity }]`, con las mismas validaciones que `POST /orders` (RN-10, RN-11, RN-14), sin `shippingAddress`, `cardToken` ni `customerId`.
- Respuesta `200`: `{ currency, lines[{ isbn, unitPrice, quantity, subtotal }], subtotal, discount, shipping, total }`, todos los montos con el formato de RN-07 (`{ amount, currency }`) y calculados con las mismas reglas del cobro (RN-02 a RN-06). Las líneas salen **ordenadas por ISBN**, con las repetidas ya sumadas, y su `subtotal` es `unitPrice × quantity`; la suma de los subtotales de línea es el `subtotal` del pedido.
- No reserva stock ni cobra, y por lo tanto **no** avisa de falta de stock (se descubre al pagar).
- Errores: los de forma del cuerpo (`400`), `NOT_FOUND`, `INVALID_ISBN`, `MAX_QUANTITY_EXCEEDED`, `CURRENCY_MISMATCH` y `UNSUPPORTED_CURRENCY`, igual que `POST /orders`.
