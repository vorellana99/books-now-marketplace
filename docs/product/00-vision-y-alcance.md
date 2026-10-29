# Visión y alcance

> Qué es LibroYa, para qué existe y hasta dónde llega cada etapa. Contenido que antes estaba en `docs/producto.md`.

## Qué es LibroYa

LibroYa es una **librería online propia**: la tienda compra sus libros, los publica en su catálogo y los vende directamente al público. Una persona entra, busca un libro, lo agrega al carrito y paga con tarjeta. La tienda confirma la compra por email y aparta las unidades vendidas para enviarlas.

No es un marketplace: no hay vendedores externos ni comisiones. Hay **un solo vendedor (LibroYa)**, un solo catálogo y un solo almacén. Los libros pueden tener precio en soles (`PEN`) o en dólares (`USD`); cada pedido usa una sola moneda.

## Para qué existe

| Necesidad | Cómo la resuelve LibroYa |
|---|---|
| El comprador quiere encontrar y comprar un libro sin complicaciones | Catálogo con búsqueda, precio visible y compra en un solo paso |
| El comprador no quiere pagar algo que no se le puede entregar | Antes de cobrar, se **aparta el stock**. Si no hay unidades, no se cobra |
| El comprador no quiere que le cobren dos veces | Si la conexión falla y el comprador reintenta, **recibe el mismo pedido y no se le cobra otra vez** |
| La tienda no quiere vender más de lo que tiene | El stock nunca queda en negativo, aunque muchos compren a la vez |
| La tienda quiere premiar a sus clientes frecuentes | Los **clientes premium** tienen descuento y envío gratis |
| La tienda necesita saber qué pasó con cada compra | Cada compra tiene un identificador que aparece en todos sus registros, desde el pago hasta el email |

## Cómo se reparte el producto en el sistema

| Área del negocio | Contexto en el código | De qué se encarga |
|---|---|---|
| Qué libros vendemos y a qué precio | **Catálogo** (`catalog`) | Datos del libro, precio y si está activo |
| Cuántas unidades hay | **Inventario** (`inventory`) | Stock disponible y unidades apartadas por pedido |
| Clientes, pedidos y pagos | **Ventas** (`sales`) | Carrito, cálculo del total, cobro, pedido y confirmación |
| Quién es quién y qué puede hacer | **Identidad** (`identity`) | Cuentas, inicio de sesión, sesiones y roles |

Cada área es dueña de sus datos y solo se comunica con las demás por su API pública ([arquitectura](../backend/01-decisiones-y-stack.md)).

## Alcance por etapas

| Etapa | Qué incluye | Estado |
|---|---|---|
| **Backend MVP** | Catálogo y búsqueda, compra con pago simulado, dirección de envío, administración de libros y stock, historial de pedidos, registro e inicio de sesión | Casi completo: el corte 7 (autenticación) está cerrado; falta la **cotización del total** antes de pagar (corte 8, DP-07) |
| **Tienda web MVP** (`apps/store-web`) | Todo lo que hace una persona compradora, **con cuenta desde el inicio**: registrarse, entrar, explorar el catálogo, armar el carrito, comprar, ver sus pedidos. Ver [historias](04-historias-de-usuario.md) | Pendiente |
| **Panel de administración** | Crear y editar libros, cargar stock, consultar pedidos de un cliente. Las historias ya están escritas (épica de administración), pero **no forman parte de la tienda web MVP** | Segunda etapa, por definir (DP-03) |

## Fuera de alcance por ahora

| Tema | Comentario |
|---|---|
| Vendedores externos (marketplace) | No es el modelo del negocio |
| Cancelaciones y devoluciones | El diseño del backend no las contempla aún |
| Cupones y promociones | — |
| Envíos, factura electrónica (SUNAT) y puntos | El backend ya los prevé como reacciones a la compra, pero no existen |
| Suscripción a cliente premium | Hoy el estado premium se cambia por SQL; no hay forma de suscribirse |
| Recuperar contraseña, verificar el correo, cambiar la contraseña, doble factor, inicio de sesión con Google | Anotados por el corte 7 del backend como trabajo posterior |
| Portada, descripción, categorías y stock visible del libro | La API solo entrega ISBN, título, autor y precio (DP-05) |
| Pago real con tarjeta | Hoy la pasarela es simulada (DP-06) |

## Estado actual de la seguridad

La API ya tiene registro, inicio de sesión, renovación y cierre de sesión, y toda ruta exige un token salvo las públicas (catálogo, autenticación y salud). Desde el corte 7 (cerrado), **el cliente de una compra sale del token** (un `customerId` en el cuerpo de `POST /orders` es un `400`), un pedido solo lo ve su dueño o un administrador (para otro es `404`), el comprador tiene `GET /me/orders`, el login, el registro y la renovación tienen límite de intentos (`429` con `Retry-After`), y la API admite CORS para los orígenes que se configuren. La administración exige el rol de administrador (`403` para un comprador). Se cumplen así las condiciones de [DP-09](09-decisiones-y-preguntas.md) para abrir la tienda al público, salvo la cotización del total (corte 8), que bloquea el paso de pago.
