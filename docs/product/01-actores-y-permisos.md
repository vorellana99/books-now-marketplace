# Actores y permisos

## Quiénes lo usan

| Actor | Qué hace | Disponible |
|---|---|---|
| 👤 **Visitante** (sin sesión) | Explora el catálogo y busca libros. Para todo lo demás debe crear una cuenta o entrar | Tienda web MVP |
| 🧑 **Comprador** | Con su cuenta: arma el carrito, compra, paga y consulta sus pedidos | Tienda web MVP |
| ⭐ **Cliente premium** | Un comprador con 10 % de descuento y envío gratis | El backend lo aplica; no hay forma de suscribirse (se marca en la BD) |
| 🧑‍💼 **Administrador de la tienda** | Crea libros, cambia precios, desactiva libros, carga stock y consulta pedidos de cualquier cliente | Backend: sí (el rol llega con `7.9`). Web: segunda etapa |
| 💳 **Pasarela de pago** (sistema externo) | Cobra y reembolsa | Simulada |
| ✉️ **Proveedor de email** (sistema externo) | Envía la confirmación de compra | Simulado (se escribe en el log del servidor) |

Una cuenta es de **un solo rol**: `BUYER` o `ADMIN`. El rol no se elige al registrarse: quien se registra es siempre `BUYER`. Los administradores se crean con un comando del servidor (tarea `7.9`).

## Qué puede hacer cada uno

| Acción | Visitante | Comprador | Administrador |
|---|:-:|:-:|:-:|
| Ver y buscar libros | ✅ | ✅ | ✅ |
| Registrarse e iniciar sesión | ✅ | — | — |
| Armar el carrito | ❌ (primero entra) | ✅ | ✅ (solo si compra) |
| Comprar | ❌ | ✅ | ✅ |
| Ver sus propios pedidos | ❌ | ✅ | ✅ |
| Ver el pedido de otra persona | ❌ | ❌ (`404`) | ✅ |
| Crear y editar libros, cargar stock | ❌ | ❌ (`403`) | ✅ |
| Ver el historial de cualquier cliente | ❌ | ❌ (`403`) | ✅ |

- **Sin sesión o con una sesión vencida** el sistema responde `401`; la tienda web lleva a la persona a iniciar sesión y la devuelve a donde estaba (ver [HU-03](04-historias-de-usuario.md)).
- **Un pedido ajeno da `404`, no `403`**, para no revelar que existe. La tienda web lo muestra como "pedido no encontrado".
- Las filas de pedidos y de administración con `404`/`403` rigen cuando se cierren las tareas `7.7` a `7.9` del backend; hasta entonces la API es más permisiva (ver [00-vision-y-alcance](00-vision-y-alcance.md#estado-actual-de-la-seguridad)).

## Usuario y cliente

Una misma persona tiene dos registros con el **mismo `id`**: su **usuario** en Identidad (correo, contraseña y rol) y su **cliente** en Ventas (a quien se le vende; es el que puede ser premium). El cliente se crea en segundo plano, alrededor de un segundo después del registro. Si la persona compra en ese instante, la API responde `404 NOT_FOUND` y basta con reintentar (ver [HU-31](04-historias-de-usuario.md)).
