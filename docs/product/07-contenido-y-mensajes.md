# Contenido y mensajes

> Cómo habla la tienda y cómo se muestran los montos y las fechas. Los textos son una **propuesta de partida**: se pueden ajustar sin tocar el comportamiento.

## Tono

- Español de Perú (`es-PE`), trato de **tú**, claro y breve. Sin jerga técnica: nunca "422", "token", "idempotencia" ni "ISBN inválido" tal cual.
- Cada error dice **qué pasó**, **si se cobró algo** (en una compra, siempre) y **qué hacer ahora**.
- Los mensajes salen del `errorCode`, nunca del texto `message` de la API, que está pensado para desarrolladores.

## Montos, fechas y números

| Dato | Formato | Ejemplo |
|---|---|---|
| Monto en soles | `S/ ` + monto con 2 decimales | `S/ 90.00` |
| Monto en dólares | monto con 2 decimales + ` USD` | `90.00 USD` |
| Separador de miles | coma | `S/ 1,250.00` |
| Origen del monto | la tienda muestra el texto `amount` de la API tal cual y solo le añade símbolo y separador de miles; **nunca convierte a número para calcular o redondear** | — |
| Fecha de un pedido | fecha y hora en la zona de Lima (UTC−5) a partir del ISO en UTC de `createdAt` | `28 oct 2026, 10:00` |
| ISBN | se muestra como 13 dígitos; puede aceptarse con guiones al escribirlo | `9780132350884` |

## Mensajes por `errorCode`

Códigos que la tienda web puede recibir y qué mostrar. Un código no listado muestra el mensaje genérico.

### Cuenta y sesión

| `errorCode` / situación | Mensaje | Dónde |
|---|---|---|
| `INVALID_CREDENTIALS` (`401`) | Correo o contraseña incorrectos. | PA-04 |
| `EMAIL_ALREADY_REGISTERED` (`409`) | Ya existe una cuenta con ese correo. ¿Quieres entrar? | PA-03 |
| `INVALID_EMAIL` (`422`) | Escribe un correo válido. | PA-03 |
| `WEAK_PASSWORD` (`422`) | Elige una contraseña más segura: al menos 10 caracteres y que no sea una de las más comunes. | PA-03 |
| `INVALID_REFRESH_TOKEN` (`401`) | Tu sesión terminó. Entra de nuevo para continuar. | PA-04 |
| `401` sin sesión | Entra para continuar. | PA-04 |
| `429` (límite de intentos, `7.10`) | Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo. | PA-03, PA-04 |

### Catálogo y pedidos

| `errorCode` / situación | Mensaje | Dónde |
|---|---|---|
| `NOT_FOUND` / `INVALID_ISBN` en un libro | Este libro no está disponible. | PA-02 |
| `NOT_FOUND` / `400` en un pedido | No encontramos este pedido. | PA-09 |
| Búsqueda sin resultados | No encontramos libros para «{q}». Prueba con otro título o autor. | PA-01 |

### Compra (`POST /orders`)

| `errorCode` / situación | ¿Se cobró? | Mensaje | Acción |
|---|:-:|---|---|
| `OUT_OF_STOCK` | No | No hay suficientes unidades de uno de tus libros. No se te cobró nada. | Volver al carrito |
| `STOCK_ITEM_NOT_FOUND` | No | Uno de tus libros no está disponible por ahora. No se te cobró nada. | Volver al carrito |
| `PAYMENT_DECLINED` | No | Tu tarjeta fue rechazada. No se te cobró nada. Prueba con otra tarjeta. | Cambiar tarjeta |
| `CHECKOUT_IN_PROGRESS` | Aún no se sabe | Estamos procesando tu pago. Espera un momento. | Esperar y reconsultar |
| `PREVIOUS_ATTEMPT_FAILED` | No | Tu intento anterior no se completó. Vamos a intentarlo de nuevo. | Reintento con clave nueva |
| `IDEMPOTENCY_KEY_REUSED` | No | Cambiaste algo en tu compra. Vamos a intentarlo de nuevo con los datos nuevos. | Reintento con clave nueva |
| `INVALID_SHIPPING_ADDRESS` | No | Revisa tu dirección de envío, en especial el teléfono. | Volver a la dirección |
| `MAX_QUANTITY_EXCEEDED` | No | Puedes comprar hasta 10 unidades de cada libro. | Volver al carrito |
| `CURRENCY_MISMATCH` | No | No puedes pagar libros en soles y en dólares en un mismo pedido. | Volver al carrito |
| `PRICE_MISMATCH`, `UNSUPPORTED_CURRENCY`, otra regla de dominio | No | No pudimos procesar tu compra. No se te cobró nada. | Volver al carrito |
| Red caída o tiempo agotado | **Se desconoce** | No pudimos confirmar tu pago. Si te llegó un cargo, no te preocupes: no se cobrará dos veces. | **Reintentar (misma clave)** |
| `5xx` | Se desconoce | Algo falló de nuestro lado. Puedes reintentar; no se te cobrará dos veces. | **Reintentar (misma clave)** |

Cuando la compra no se pudo confirmar (red o `5xx`), el mensaje **no** afirma que no se cobró: no se sabe. La garantía es que reintentar con la misma clave no duplica el cobro (RN-21).

### Genérico

| Situación | Mensaje |
|---|---|
| Error inesperado | Algo salió mal. Inténtalo de nuevo en unos minutos. |
| Sin conexión | Parece que no tienes conexión a internet. |

## Textos fijos de la tienda

| Dónde | Texto |
|---|---|
| Regla de envío (carrito) | Envío S/ 10.00. Gratis desde S/ 150.00 (3.00 USD y gratis desde 40.00 USD en pedidos en dólares). |
| Pagar | Pagar {monto}, por ejemplo "Pagar S/ 90.00" |
| Total a pagar (carrito y pago) | Subtotal · Descuento · Envío ("Gratis" o su costo) · **Total a pagar** |
| Cotización fallida | No pudimos calcular tu total. Reintentar |
| Procesando | Procesando tu pago… No cierres esta página. |
| Confirmación | ¡Gracias por tu compra! Te enviamos un email de confirmación. |
| Máximo por libro | Máximo 10 unidades por libro en cada pedido. |
| Carrito vacío | Tu carrito está vacío. Ver libros |
| Pedidos vacío | Aún no has hecho ninguna compra. Ver libros |
