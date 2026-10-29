# Reglas de negocio

> Cada regla tiene un identificador `RN-nn` para citarla desde las historias y las guías. Quien aplica la regla en el sistema es **siempre el backend**: la tienda web puede mostrarla o anticiparla, pero no es la fuente del resultado.

## Precio y total

| ID | Regla | Detalle |
|---|---|---|
| RN-01 | **Precio del libro** | Lo define el catálogo. Al comprar, el título y el precio **se copian en el pedido**: si después el precio cambia, el pedido conserva el que pagó el cliente |
| RN-02 | **Descuento premium** | 10 % sobre el subtotal |
| RN-03 | **Costo de envío** | S/ 10.00 en soles · 3.00 USD en dólares |
| RN-04 | **Envío gratis** | Si el subtotal (antes del descuento) es **de S/ 150.00 o más** (**40.00 USD o más** en pedidos en dólares), o si el cliente es premium |
| RN-05 | **Una sola moneda** | Todos los libros de un pedido deben tener la misma moneda (`CURRENCY_MISMATCH` si no). El mínimo de envío gratis y el costo de envío tienen un valor propio por moneda; no se convierten. El descuento premium, al ser un porcentaje, es igual en ambas |
| RN-06 | **Redondeo** | El total se calcula con todos los decimales y se redondea **una sola vez**, a 2 decimales y con la mitad hacia arriba, justo antes de cobrar |
| RN-07 | **Formato de montos** | En la API, todo monto es `{ "amount": "45.00", "currency": "PEN" }`: texto con 2 decimales, punto decimal, sin separador de miles. Nunca un número |
| RN-08 | **El total antes de pagar lo calcula el backend** | La tienda muestra el subtotal, el descuento, el envío y el total que devuelve la **cotización** (`POST /orders/quote`, pendiente) y nunca los calcula ella. La cotización no reserva stock ni cobra, y el total puede cambiar antes de pagar si cambia un precio o la condición premium; lo que manda es el `charged` del pedido (DP-07) |

**Ejemplos del total cobrado:**

| Cliente | Subtotal | Descuento | Envío | Total |
|---|---|---|---|---|
| Normal | S/ 100.00 | — | S/ 10.00 | **S/ 110.00** |
| Normal | S/ 160.00 | — | Gratis (≥ S/ 150) | **S/ 160.00** |
| Premium | S/ 100.00 | −S/ 10.00 | Gratis (premium) | **S/ 90.00** |
| Premium | S/ 200.00 | −S/ 20.00 | Gratis | **S/ 180.00** |

**Ejemplos en dólares:**

| Cliente | Subtotal | Descuento | Envío | Total |
|---|---|---|---|---|
| Normal | 20.00 USD | — | 3.00 USD | **23.00 USD** |
| Normal | 50.00 USD | — | Gratis (≥ 40 USD) | **50.00 USD** |
| Premium | 20.00 USD | −2.00 USD | Gratis (premium) | **18.00 USD** |
| Premium | 100.00 USD | −10.00 USD | Gratis | **90.00 USD** |

## Libros, stock y cantidades

| ID | Regla | Detalle |
|---|---|---|
| RN-10 | **Máximo por libro** | 10 unidades del mismo libro por pedido, sumando líneas repetidas (`MAX_QUANTITY_EXCEEDED`) |
| RN-11 | **Máximo de líneas** | Un pedido tiene de 1 a 100 líneas. La cantidad de cada una es un entero ≥ 1 |
| RN-12 | **Libros desactivados** | Un libro inactivo ya no se puede comprar ni se busca; los pedidos antiguos lo siguen mostrando |
| RN-13 | **Stock** | Antes de cobrar se aparta el stock; si no alcanza, no se cobra (`OUT_OF_STOCK`). El stock nunca queda en negativo. La API no expone cuántas unidades quedan |
| RN-14 | **ISBN válido** | Con 13 dígitos y dígito de control correcto (`INVALID_ISBN`) |

## Compra

| ID | Regla | Detalle |
|---|---|---|
| RN-20 | **Compra todo o nada** | O la compra sale completa (pedido creado, pago hecho y unidades apartadas), o no sale y la persona no pierde nada. Si el pago es rechazado se devuelven las unidades |
| RN-21 | **Un reintento no cobra dos veces** | Cada intento lleva una `Idempotency-Key` (UUID). Repetir la misma clave con el mismo carrito devuelve el mismo pedido. Con otro carrito, otra dirección o tras un intento fallido, hay que usar una clave nueva (`IDEMPOTENCY_KEY_REUSED`, `PREVIOUS_ATTEMPT_FAILED`). Mientras el primer intento sigue en curso, `CHECKOUT_IN_PROGRESS` |
| RN-22 | **Dirección de envío obligatoria** | `recipient` (hasta 100 caracteres), `phone` (hasta 20; dígitos, espacios, `+`, `-` y paréntesis, con al menos 6 dígitos), `line1` (200), `district` (60), `province` (60), `department` (60) y `reference` opcional (200). Sin saltos de línea ni caracteres de control (`INVALID_SHIPPING_ADDRESS`). Los espacios de los extremos se recortan |
| RN-23 | **El cliente no manda precios** | La tienda web envía solo ISBN y cantidad; el precio y los totales los calcula el backend |
| RN-24 | **Tarjeta** | La tarjeta real nunca pasa por LibroYa: solo viaja un `cardToken` (hasta 255 caracteres) a la pasarela, y no se guarda ni se registra |
| RN-25 | **Confirmación** | Tras la compra se envía un email de confirmación y las unidades quedan apartadas para el envío |

## Cuentas y sesión

| ID | Regla | Detalle |
|---|---|---|
| RN-30 | **Registro** | Con correo y contraseña. El correo no distingue mayúsculas, debe tener formato válido (`INVALID_EMAIL`) y no puede estar ya registrado (`EMAIL_ALREADY_REGISTERED`). **No se verifica el correo** por ahora |
| RN-31 | **Contraseña** | De 10 a 128 caracteres, los espacios cuentan, sin reglas de composición. Se rechazan las contraseñas muy comunes y la igual al correo (`WEAK_PASSWORD`) |
| RN-32 | **Rol del registro** | Quien se registra es siempre comprador (`BUYER`) |
| RN-33 | **Inicio de sesión** | El error es el mismo con un correo desconocido que con una contraseña equivocada (`INVALID_CREDENTIALS`): la pantalla no puede revelar qué correos existen |
| RN-34 | **Vida de la sesión** | El token de acceso vale 15 minutos. El de refresco vale 14 días sin usarse y **sirve una sola vez**: cada renovación entrega uno nuevo. Si se presenta uno ya usado, se asume robo y se cierra la sesión entera (`INVALID_REFRESH_TOKEN`) |
| RN-35 | **Cerrar sesión** | Cierra la sesión de ese dispositivo; las de otros dispositivos siguen. El token de acceso ya emitido vale hasta que vence |
| RN-36 | **Cada quien ve lo suyo** | Un comprador ve solo sus pedidos; un pedido ajeno da `404`. El administrador ve cualquiera. Rige en el backend desde `7.7` |
| RN-37 | **Límite de intentos** | Login (por dirección y por correo), registro, y renovación junto con cierre de sesión (por dirección) tienen límite de intentos por ventana (60 segundos por defecto): al pasarse, `429 TOO_MANY_REQUESTS` con la cabecera `Retry-After` en segundos. Cuentan todos los intentos, también los correctos. Tarea `7.10`, hecha |

## Historial de pedidos

| ID | Regla | Detalle |
|---|---|---|
| RN-40 | **Orden** | Del más reciente al más antiguo |
| RN-41 | **Paginación por cursor** | De 1 a 50 por página (20 por defecto). `nextCursor` es un texto opaco que se devuelve tal cual para pedir la página siguiente; `null` en la última |
| RN-42 | **Privacidad** | El detalle de un pedido con dirección y teléfono solo lo ve su dueño o un administrador |

## Administración (segunda etapa)

| ID | Regla | Detalle |
|---|---|---|
| RN-50 | **Crear libro** | ISBN válido, título y autor (sin saltos de línea; se recortan) y precio mayor que cero y hasta 1 000 000, con 2 decimales. Nace activo y con stock en cero |
| RN-51 | **Editar libro** | Cualquier subconjunto de título, autor, precio y activo, pero al menos uno. La moneda no se cambia (`CURRENCY_CANNOT_CHANGE`). Un cambio de precio no afecta a pedidos ya hechos |
| RN-52 | **Cargar stock** | Se **suma** a lo disponible (no es un valor final): un entero de 1 a 100 000, sin pasar de 1 000 000 disponibles. No hay historial de cargas |
