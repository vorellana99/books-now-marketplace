# Glosario

| Término | Significado |
|---|---|
| **ISBN** | Código de 13 dígitos que identifica a un libro. La API lo acepta con o sin guiones y lo devuelve sin ellos |
| **Libro activo / inactivo** | Un libro no se borra: se desactiva. Un libro inactivo no se puede comprar ni aparece en la búsqueda, pero los pedidos antiguos lo siguen mostrando |
| **Carrito** | Los libros y cantidades que la persona piensa comprar. **No existe en la API**: es un concepto de la tienda web (ver [DP-04](09-decisiones-y-preguntas.md)) |
| **Línea** | Un libro con su cantidad, dentro de un carrito o de un pedido |
| **Pedido** | Una compra completada: libros, cantidades, precios, dirección de envío y total cobrado |
| **Checkout** | El intento de compra, desde que la persona paga hasta que el pedido queda creado o anulado |
| **Reserva** | Unidades apartadas para un pedido, que ya no se pueden vender a otro |
| **Subtotal** | Suma de precio × cantidad de cada libro, antes de descuentos y envío |
| **Total cobrado** (`charged`) | Lo que realmente se cargó a la tarjeta: subtotal − descuento + envío, redondeado una sola vez |
| **Cliente premium** | Cliente con 10 % de descuento y envío gratis |
| **Clave de idempotencia** (`Idempotency-Key`) | Identificador (UUID) que la tienda web genera **una vez por intento de compra** y envía al pagar, para que un reintento no cobre dos veces |
| **Token de la tarjeta** (`cardToken`) | Texto que representa la tarjeta ante la pasarela. La tarjeta real nunca pasa por LibroYa |
| **Cuenta / usuario** | Correo, contraseña y rol de una persona en Identidad |
| **Sesión** | El periodo en que una persona está identificada. Se compone de un token de acceso y un token de refresco |
| **Token de acceso** | Credencial de vida corta (15 minutos por defecto) que viaja en `Authorization: Bearer` |
| **Token de refresco** | Credencial de vida larga y de un solo uso que sirve para obtener otro token de acceso sin pedir la contraseña. Cada renovación entrega uno nuevo |
| **Rol** | `BUYER` (comprador) o `ADMIN` (administrador) |
| **Moneda** | `PEN` (soles, "S/") o `USD` (dólares). Un pedido tiene una sola |
| **Dirección de envío** | Destinatario, teléfono, calle, distrito, provincia, departamento y referencia opcional. Es obligatoria al comprar |
| **`errorCode`** | Código estable que la API devuelve en cada error de negocio (`OUT_OF_STOCK`, `PAYMENT_DECLINED`…). La tienda web decide el mensaje con él, nunca con el texto `message` |
