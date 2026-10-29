# Historias de usuario

> Cada historia tiene un identificador `HU-nn`, las reglas que aplica (`RN`), las pantallas donde ocurre (`PA`, ver [06](06-pantallas-y-navegacion.md)) y criterios de aceptación en formato **Dado / Cuando / Entonces**. La columna **API** indica si el backend ya ofrece lo necesario; **Web**, si `apps/store-web` lo implementa. Leyenda: ✅ hecho · 🔄 parcial · ⬜ pendiente · — no aplica.

## Resumen

| ID | Historia | Épica | API | Web | Etapa |
|---|---|---|:-:|:-:|---|
| [HU-01](#hu-01-registrarme) | Registrarme | Cuenta | ✅ | ⬜ | Tienda MVP |
| [HU-02](#hu-02-iniciar-sesión) | Iniciar sesión | Cuenta | ✅ | ⬜ | Tienda MVP |
| [HU-03](#hu-03-mantener-la-sesión) | Mantener la sesión | Cuenta | ✅ | ⬜ | Tienda MVP |
| [HU-04](#hu-04-cerrar-sesión) | Cerrar sesión | Cuenta | ✅ | ⬜ | Tienda MVP |
| [HU-10](#hu-10-buscar-libros) | Buscar libros | Catálogo | ✅ | ⬜ | Tienda MVP |
| [HU-11](#hu-11-ver-un-libro) | Ver un libro | Catálogo | ✅ | ⬜ | Tienda MVP |
| [HU-20](#hu-20-agregar-un-libro-al-carrito) | Agregar un libro al carrito | Carrito | — | ⬜ | Tienda MVP |
| [HU-21](#hu-21-cambiar-la-cantidad-o-quitar-un-libro) | Cambiar la cantidad o quitar un libro | Carrito | — | ⬜ | Tienda MVP |
| [HU-22](#hu-22-ver-el-carrito) | Ver el carrito | Carrito | ⬜ (cotización) | ⬜ | Tienda MVP |
| [HU-30](#hu-30-indicar-la-dirección-de-envío) | Indicar la dirección de envío | Compra | ✅ | ⬜ | Tienda MVP |
| [HU-31](#hu-31-pagar-y-crear-el-pedido) | Pagar y crear el pedido | Compra | ✅ | ⬜ | Tienda MVP |
| [HU-32](#hu-32-reintentar-sin-cobrar-dos-veces) | Reintentar sin cobrar dos veces | Compra | ✅ | ⬜ | Tienda MVP |
| [HU-33](#hu-33-entender-por-qué-falló-la-compra) | Entender por qué falló la compra | Compra | ✅ | ⬜ | Tienda MVP |
| [HU-34](#hu-34-ver-la-confirmación) | Ver la confirmación | Compra | ✅ | ⬜ | Tienda MVP |
| [HU-40](#hu-40-ver-mis-pedidos) | Ver mis pedidos | Pedidos | ✅ | ⬜ | Tienda MVP |
| [HU-41](#hu-41-ver-el-detalle-de-un-pedido) | Ver el detalle de un pedido | Pedidos | ✅ (sin dirección, DP-15) | ⬜ | Tienda MVP |
| [HU-50](#hu-50-crear-un-libro) | Crear un libro | Administración | ✅ | ⬜ | Segunda etapa |
| [HU-51](#hu-51-editar-o-desactivar-un-libro) | Editar o desactivar un libro | Administración | ✅ | ⬜ | Segunda etapa |
| [HU-52](#hu-52-cargar-stock) | Cargar stock | Administración | ✅ | ⬜ | Segunda etapa |
| [HU-53](#hu-53-ver-los-pedidos-de-un-cliente) | Ver los pedidos de un cliente | Administración | ✅ | ⬜ | Segunda etapa |

La columna **API** de las historias del corte 7 pasó a ✅ al cerrarse ese corte del backend (ver [00-avance](../backend/00-avance.md)); la única que queda es HU-22, a la espera de la cotización (corte 8).

---

## Cuenta

### HU-01 Registrarme

**Como** visitante, **quiero** crear una cuenta con mi correo y una contraseña, **para** poder armar un carrito y comprar.
Reglas: RN-30, RN-31, RN-32 · Pantallas: PA-03 · `POST /auth/register`

- **Dado** que escribo un correo válido y una contraseña de 10 a 128 caracteres, **cuando** envío el formulario, **entonces** se crea mi cuenta y la tienda inicia mi sesión sola con esas mismas credenciales ([DP-11](09-decisiones-y-preguntas.md)) y me lleva a donde estaba o al catálogo.
- **Dado** que la cuenta se creó pero el inicio de sesión automático falla, **cuando** ocurre, **entonces** veo "Cuenta creada. Entra para continuar" y voy a PA-04 con el correo ya escrito.
- **Dado** que el correo ya tiene cuenta (`EMAIL_ALREADY_REGISTERED`), **cuando** envío, **entonces** veo un mensaje que me ofrece iniciar sesión, sin perder lo que escribí.
- **Dado** una contraseña débil (`WEAK_PASSWORD`) o un correo inválido (`INVALID_EMAIL`), **cuando** envío, **entonces** veo el motivo junto al campo.
- **Dado** que estoy escribiendo, **cuando** la contraseña tiene menos de 10 caracteres, **entonces** el formulario me lo avisa antes de enviar, pero la decisión final siempre es del servidor.
- **Dado** que envío el formulario, **cuando** la petición está en curso, **entonces** el botón queda deshabilitado para no registrar dos veces.

### HU-02 Iniciar sesión

**Como** comprador, **quiero** entrar con mi correo y contraseña, **para** acceder a mi carrito y mis pedidos.
Reglas: RN-33, RN-34 · Pantallas: PA-04 · `POST /auth/login`

- **Dado** credenciales correctas, **cuando** envío, **entonces** quedo con sesión iniciada y vuelvo a la pantalla que intentaba abrir (o al catálogo si vine directo).
- **Dado** credenciales incorrectas (`INVALID_CREDENTIALS`), **cuando** envío, **entonces** veo un mensaje único ("Correo o contraseña incorrectos"), sin indicar cuál de los dos falla.
- **Dado** que abrí el sitio otra vez dentro de los 14 días de mi último uso, **cuando** carga la tienda, **entonces** sigo con sesión iniciada sin escribir la contraseña (ver HU-03).

### HU-03 Mantener la sesión

**Como** comprador con sesión, **quiero** que mi sesión se renueve sola, **para** no ser expulsado en medio de una compra.
Reglas: RN-34 · `POST /auth/refresh`

- **Dado** que mi token de acceso venció, **cuando** hago cualquier acción que lo necesita, **entonces** la tienda lo renueva en segundo plano y repite la acción sin que yo lo note.
- **Dado** que la renovación falla (`INVALID_REFRESH_TOKEN`), **cuando** ocurre, **entonces** la tienda borra mi sesión local, me lleva a iniciar sesión con el aviso "Tu sesión terminó, entra de nuevo" y, al entrar, vuelvo a donde estaba.
- **Dado** que tengo la tienda abierta en dos pestañas, **cuando** una renueva la sesión, **entonces** la otra no debe reutilizar el token viejo (un token de refresco sirve una sola vez; reutilizarlo cierra la sesión entera).
- **Dado** que recibo `401` en una petición, **cuando** el token de refresco no existe, **entonces** voy a PA-04 conservando la ruta de origen.

### HU-04 Cerrar sesión

**Como** comprador, **quiero** cerrar mi sesión, **para** proteger mi cuenta en un equipo compartido.
Reglas: RN-35 · `POST /auth/logout`

- **Dado** que pulso "Cerrar sesión", **cuando** la API responde (o falla la red), **entonces** la tienda borra mis credenciales locales y me lleva al catálogo como visitante.
- **Dado** que cierro sesión, **cuando** vuelvo a entrar, **entonces** mi carrito se conserva ([DP-04](09-decisiones-y-preguntas.md)).

---

## Catálogo

### HU-10 Buscar libros

**Como** visitante o comprador, **quiero** buscar libros por título o autor, **para** encontrar el que quiero.
Reglas: RN-12 · Pantallas: PA-01 · `GET /books?q=&page=&pageSize=`

- **Dado** que abro el catálogo sin buscar, **cuando** carga, **entonces** veo los libros activos ordenados por título, de 20 en 20, con título, autor y precio.
- **Dado** que escribo en el buscador, **cuando** envío la búsqueda, **entonces** veo los libros cuyo título o autor coinciden, sin distinguir mayúsculas ni acentos, y la URL guarda la búsqueda y la página (se puede compartir).
- **Dado** una búsqueda sin resultados, **cuando** carga, **entonces** veo un mensaje vacío con una sugerencia ("No encontramos libros para «x»") y la opción de limpiar la búsqueda.
- **Dado** que hay más de una página, **cuando** pulso "siguiente", **entonces** veo la página siguiente y sé en cuál estoy y cuántos resultados hay en total.
- **Dado** que la carga tarda o falla, **cuando** ocurre, **entonces** veo un estado de carga y, si falla, un mensaje con la opción de reintentar.

### HU-11 Ver un libro

**Como** visitante o comprador, **quiero** ver los datos de un libro, **para** decidir si lo compro.
Reglas: RN-12, RN-14 · Pantallas: PA-02 · `GET /books/:isbn`

- **Dado** un libro activo, **cuando** abro su página, **entonces** veo título, autor, ISBN y precio con su moneda, y un botón "Agregar al carrito".
- **Dado** un ISBN que no existe o está inactivo (`NOT_FOUND`), **cuando** abro la página, **entonces** veo "Este libro no está disponible" con un enlace al catálogo.
- **Dado** un ISBN mal formado (`INVALID_ISBN`), **cuando** abro la página, **entonces** veo el mismo mensaje de "no encontrado".
- **Dado** que no tengo sesión, **cuando** pulso "Agregar al carrito", **entonces** voy a iniciar sesión y, al entrar, vuelvo a este libro (ver HU-20).

---

## Carrito

> La API **no tiene carrito**: la tienda web lo guarda ([DP-04](09-decisiones-y-preguntas.md)). Como se necesita cuenta desde el inicio ([DP-02](09-decisiones-y-preguntas.md)), el carrito pertenece a la persona con sesión.

### HU-20 Agregar un libro al carrito

**Como** comprador con sesión, **quiero** agregar un libro, **para** comprarlo junto con otros.
Reglas: RN-10, RN-05 · Pantallas: PA-01, PA-02, PA-05

- **Dado** que tengo sesión, **cuando** pulso "Agregar al carrito", **entonces** el libro entra con cantidad 1 y veo una confirmación y el número de unidades en el carrito.
- **Dado** que el libro ya está en el carrito, **cuando** lo agrego otra vez, **entonces** su cantidad sube en 1.
- **Dado** que ya tengo 10 unidades de ese libro, **cuando** intento agregar otra, **entonces** no se agrega y veo "Máximo 10 por pedido" (RN-10).
- **Dado** que el carrito tiene libros en una moneda, **cuando** agrego uno en la otra, **entonces** no se agrega y veo un aviso: un pedido se paga en una sola moneda (RN-05). La tienda no convierte monedas.
- **Dado** que no tengo sesión, **cuando** intento agregar, **entonces** voy a PA-04 con el aviso "Entra para armar tu carrito" y, tras entrar, vuelvo al libro **sin** que se agregue solo ([DP-12](09-decisiones-y-preguntas.md)).

### HU-21 Cambiar la cantidad o quitar un libro

**Como** comprador, **quiero** ajustar mi carrito, **para** comprar exactamente lo que quiero.
Reglas: RN-10, RN-11 · Pantallas: PA-05

- **Dado** un libro en el carrito, **cuando** cambio su cantidad, **entonces** puedo elegir de 1 a 10 y el subtotal se actualiza al instante.
- **Dado** un libro en el carrito, **cuando** pulso "Quitar", **entonces** desaparece y puedo deshacerlo durante unos segundos.
- **Dado** que quito el último libro, **cuando** el carrito queda vacío, **entonces** veo un estado vacío con un enlace al catálogo.

### HU-22 Ver el carrito

**Como** comprador, **quiero** ver mi carrito con el total que voy a pagar, **para** saber cuánto voy a gastar antes de pagar.
Reglas: RN-01 a RN-08 · Pantallas: PA-05 · `POST /orders/quote` (pendiente, [DP-07](09-decisiones-y-preguntas.md))

- **Dado** un carrito con libros, **cuando** lo abro, **entonces** veo por línea título, autor, precio unitario y cantidad (los libros salen del carrito de la tienda).
- **Dado** un carrito con libros, **cuando** lo abro o cambio una cantidad, **entonces** la tienda pide la **cotización** al backend y muestra el **subtotal de cada línea**, el subtotal, el descuento (si lo hay), el envío y el **total a pagar**, en la moneda del carrito. La tienda nunca calcula estos montos (RN-08, DP-20).
- **Dado** que la cotización está en curso, **cuando** espero, **entonces** veo el total anterior atenuado o un indicador de carga, y no se puede continuar a pagar hasta tener el total vigente.
- **Dado** que la cotización falla (red o `5xx`), **cuando** ocurre, **entonces** veo "No pudimos calcular tu total" con la opción de reintentar y no se puede continuar.
- **Dado** el envío, **cuando** lo veo, **entonces** aparece como "Gratis" o con su costo, y la pantalla explica la regla ("Envío S/ 10.00 · gratis desde S/ 150.00").
- **Dado** que la cotización no reserva stock, **cuando** veo el total, **entonces** la pantalla no promete disponibilidad: si falta stock se descubre al pagar (HU-33).
- **Dado** que un libro cambió de precio o se desactivó desde que lo agregué, **cuando** abro el carrito, **entonces** la tienda vuelve a consultar los libros, muestra el precio vigente y avisa de lo que cambió; un libro inactivo se marca como no disponible y no deja pagar hasta quitarlo.
- **Dado** que el carrito tiene libros, **cuando** pulso "Continuar con la compra", **entonces** voy a PA-06.

---

## Compra

### HU-30 Indicar la dirección de envío

**Como** comprador, **quiero** indicar dónde recibir mi pedido, **para** que me llegue a mí.
Reglas: RN-22 · Pantallas: PA-06

- **Dado** el formulario de envío, **cuando** lo completo, **entonces** pide destinatario, teléfono, dirección, distrito, provincia y departamento, y una referencia opcional, con los largos máximos de RN-22.
- **Dado** un teléfono inválido o con saltos de línea (`INVALID_SHIPPING_ADDRESS`), **cuando** envío, **entonces** veo el error junto al campo y no se intenta cobrar.
- **Dado** que escribí espacios de más al inicio o al final, **cuando** envío, **entonces** se recortan sin avisarme.
- **Dado** que la API no guarda direcciones y la tienda tampoco las recuerda ([DP-13](09-decisiones-y-preguntas.md)), **cuando** vuelvo a comprar, **entonces** el formulario aparece vacío y la escribo de nuevo.
- **Dado** que ya escribí la dirección en este intento de compra, **cuando** vuelvo al carrito y regreso a pagar sin cerrar la página, **entonces** conserva lo que escribí (solo durante la compra en curso).

### HU-31 Pagar y crear el pedido

**Como** comprador, **quiero** pagar con tarjeta, **para** que la tienda me envíe mis libros.
Reglas: RN-20, RN-21, RN-23, RN-24, RN-25 · Pantallas: PA-06 · `POST /orders` con `Idempotency-Key`

- **Dado** que llego a pagar, **cuando** veo el resumen, **entonces** muestro el total de la cotización vigente (HU-22), y el botón "Pagar" dice el monto ("Pagar S/ 90.00").
- **Dado** que el total cobrado (`charged`) difiere del cotizado porque cambió un precio o mi condición premium, **cuando** se crea el pedido, **entonces** la confirmación muestra el total realmente cobrado (RN-08).
- **Dado** un carrito válido y una dirección completa, **cuando** pulso "Pagar", **entonces** la tienda genera una `Idempotency-Key` nueva (si es un intento nuevo), envía solo ISBN y cantidad de cada línea, la dirección y el `cardToken`, y me muestra un estado de "Procesando tu pago…" que no se puede enviar dos veces.
- **Dado** que el pago es aprobado, **cuando** la API responde `201`, **entonces** vacío el carrito y voy a PA-07 con el total cobrado.
- **Dado** que la pasarela tarda (la simulada demora unos 3 segundos), **cuando** espero, **entonces** veo el estado de procesando y no puedo salir sin confirmar.
- **Dado** que compro justo después de registrarme (`404 NOT_FOUND` por cliente aún no creado), **cuando** ocurre, **entonces** la tienda reintenta sola una vez tras un par de segundos con **la misma clave**; si persiste, muestra el error genérico de HU-33.
- **Dado** que la tarjeta se ingresa en la tienda, **cuando** pago, **entonces** el número de la tarjeta nunca se envía a LibroYa: solo el `cardToken` ([DP-06](09-decisiones-y-preguntas.md)). Mientras la pasarela sea simulada, la tienda usa un token fijo de desarrollo.
- **Dado** que el cliente de la compra es el de mi sesión, **cuando** la tienda compra, **entonces** **no** envía `customerId` (la API lo rechaza con `400`: lo toma del token) y solo un comprador puede comprar (un administrador recibe `403`).

### HU-32 Reintentar sin cobrar dos veces

**Como** comprador, **quiero** poder reintentar si se cortó mi conexión, **para** no pagar dos veces.
Reglas: RN-21 · Pantallas: PA-06

- **Dado** que la respuesta de mi pago nunca llegó (red caída, tiempo agotado), **cuando** pulso "Reintentar", **entonces** la tienda envía la **misma** `Idempotency-Key` y el mismo carrito, y si el pedido se había creado, recibo ese mismo pedido sin un segundo cobro.
- **Dado** que el primer intento sigue en curso (`CHECKOUT_IN_PROGRESS`), **cuando** reintento, **entonces** veo "Estamos procesando tu pago, espera un momento" y la tienda vuelve a consultar sola.
- **Dado** que el intento anterior falló (`PREVIOUS_ATTEMPT_FAILED`) o cambié el carrito o la dirección (`IDEMPOTENCY_KEY_REUSED`), **cuando** reintento, **entonces** la tienda genera una clave **nueva** y reenvía.
- **Dado** que cambio algo del carrito o de la dirección, **cuando** pago de nuevo, **entonces** nunca reutilizo la clave anterior.
- **Dado** que recargo la página en medio de un pago, **cuando** vuelve a cargar, **entonces** la tienda conserva la clave del intento en curso para que el reintento sea seguro (ver [DP-14](09-decisiones-y-preguntas.md)).

### HU-33 Entender por qué falló la compra

**Como** comprador, **quiero** saber por qué no se completó mi compra y qué hacer, **para** resolverlo.
Reglas: RN-13, RN-20 · Pantallas: PA-06 · Mensajes: [07](07-contenido-y-mensajes.md)

- **Dado** que no hay stock (`OUT_OF_STOCK`), **cuando** falla, **entonces** veo que no se cobró nada y puedo volver al carrito para ajustar.
- **Dado** que la tarjeta es rechazada (`PAYMENT_DECLINED`), **cuando** falla, **entonces** veo que no se hizo ningún cargo y puedo probar con otra tarjeta; el pedido no se crea.
- **Dado** un error del servidor o de la pasarela (`5xx`), **cuando** ocurre, **entonces** veo un mensaje genérico con la opción de reintentar de forma segura (HU-32), sin mostrar detalles técnicos.
- **Dado** cualquier error, **cuando** se muestra, **entonces** el mensaje sale del `errorCode` y no del texto `message` de la API; un código desconocido muestra el mensaje genérico.
- **Dado** que la sesión venció en medio del pago (`401`), **cuando** ocurre, **entonces** se renueva en segundo plano (HU-03) y el pago se reenvía **con la misma clave**.

### HU-34 Ver la confirmación

**Como** comprador, **quiero** ver la confirmación de mi compra, **para** saber que salió bien.
Reglas: RN-25 · Pantallas: PA-07 · `GET /orders/:id`

- **Dado** que el pedido se creó, **cuando** se muestra la confirmación, **entonces** veo el número de pedido, los libros, el **total cobrado** con su moneda y un aviso de que se envió un email de confirmación.
- **Dado** que recargo la confirmación, **cuando** vuelve a cargar, **entonces** veo lo mismo (se lee el pedido de la API, no de la memoria).
- **Dado** la confirmación, **cuando** pulso "Ver mis pedidos" o "Seguir comprando", **entonces** voy a PA-08 o a PA-01.

---

## Pedidos

### HU-40 Ver mis pedidos

**Como** comprador, **quiero** ver mi historial de pedidos, **para** consultar qué compré y cuánto pagué.
Reglas: RN-36, RN-40, RN-41, RN-42 · Pantallas: PA-08 · `GET /me/orders`

- **Dado** que tengo pedidos, **cuando** abro "Mis pedidos", **entonces** los veo del más reciente al más antiguo, con fecha, total cobrado y cantidad de libros.
- **Dado** que hay más de una página, **cuando** llego al final, **entonces** puedo pedir más y la tienda usa `nextCursor` tal cual.
- **Dado** que no tengo pedidos, **cuando** abro la lista, **entonces** veo un estado vacío con un enlace al catálogo.
- **Dado** que la ruta del comprador existe (`GET /me/orders`, desde `7.8`), **cuando** se construye esta pantalla, **entonces** se hace contra ella, con la forma de [DP-18](09-decisiones-y-preguntas.md), y no contra `GET /admin/orders?customerId=` (que es de administración).

### HU-41 Ver el detalle de un pedido

**Como** comprador, **quiero** abrir uno de mis pedidos, **para** ver sus libros y el total.
Reglas: RN-01, RN-36, RN-42 · Pantallas: PA-09 · `GET /orders/:id`

- **Dado** un pedido mío, **cuando** lo abro, **entonces** veo estado, total cobrado y por línea ISBN, título, precio unitario **del momento de la compra** y cantidad.
- **Dado** un pedido que no es mío o no existe (`NOT_FOUND`), **cuando** abro la página, **entonces** veo "Pedido no encontrado".
- **Dado** que el id no es un UUID (`400`), **cuando** abro la página, **entonces** veo el mismo "Pedido no encontrado".
- **Dado** que la dirección y el teléfono se mostrarían a su dueño ([DP-15](09-decisiones-y-preguntas.md), **por decidir**: `GET /orders/:id` no los devuelve hoy; sí los trae cada ítem de `GET /me/orders`), **cuando** el pedido trae `shippingAddress`, **entonces** la pantalla muestra una sección "Envío" con destinatario, teléfono y dirección.
- **Dado** que hoy el endpoint **no** la devuelve (o el pedido es anterior a la dirección y viene `null`), **cuando** se muestra el pedido, **entonces** no hay sección de envío.

---

## Administración (segunda etapa)

> No forman parte de la tienda web MVP ([DP-03](09-decisiones-y-preguntas.md)). Se escriben ahora para que el backend y el producto estén alineados. Requieren rol `ADMIN` (`7.9`).

### HU-50 Crear un libro

**Como** administrador, **quiero** registrar un libro nuevo, **para** venderlo.
Reglas: RN-50 · `POST /admin/books`

- **Dado** un ISBN válido, título, autor y precio, **cuando** lo envío, **entonces** el libro aparece activo en el catálogo y con stock en cero.
- **Dado** un ISBN ya registrado (`BOOK_ALREADY_EXISTS`), un precio inválido (`INVALID_PRICE`) o una moneda inválida (`INVALID_CURRENCY`), **cuando** envío, **entonces** veo el motivo junto al campo.

### HU-51 Editar o desactivar un libro

**Como** administrador, **quiero** cambiar el precio o los datos de un libro, o desactivarlo, **para** mantener el catálogo al día.
Reglas: RN-51 · `PATCH /admin/books/:isbn`

- **Dado** un libro, **cuando** cambio título, autor, precio o activo, **entonces** se aplica todo o nada y los pedidos ya hechos conservan su precio.
- **Dado** que intento cambiar la moneda (`CURRENCY_CANNOT_CHANGE`), **cuando** envío, **entonces** se rechaza.

### HU-52 Cargar stock

**Como** administrador, **quiero** sumar unidades al stock de un libro, **para** poder venderlas.
Reglas: RN-52 · `POST /admin/stock/:isbn/additions`

- **Dado** un libro con stock, **cuando** cargo 25 unidades, **entonces** el disponible sube en 25 y veo el nivel resultante.
- **Dado** una cantidad fuera de rango o que supera el máximo (`STOCK_LIMIT_EXCEEDED`), **cuando** envío, **entonces** veo el motivo.

### HU-53 Ver los pedidos de un cliente

**Como** administrador, **quiero** consultar los pedidos de cualquier cliente, **para** atender sus consultas.
Reglas: RN-40, RN-41 · `GET /admin/orders?customerId=` (desde `7.8`; exige rol de administrador)

- **Dado** un cliente, **cuando** consulto sus pedidos, **entonces** los veo del más reciente al más antiguo, con la dirección de envío, paginados por cursor.
