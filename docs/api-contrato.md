# LibroYa API: contrato

> Rutas, respuestas, errores y formato de montos. Es lo que consume el frontend; la implementación está en [backend/05-piezas-clave.md](backend/05-piezas-clave.md).

## 8. Endpoints

| Método | Ruta | Respuesta | Errores (`errorCode`) |
|---|---|---|---|
| `POST` | `/orders` (header `Idempotency-Key`) | `201 { orderId, charged: { amount: "90.00", currency: "PEN" } }`, también al reintentar una compra completada | `400` DTO o falta la clave · `404 NOT_FOUND` · `409 CHECKOUT_IN_PROGRESS` · `422 OUT_OF_STOCK`, `STOCK_ITEM_NOT_FOUND`, `PAYMENT_DECLINED`, `IDEMPOTENCY_KEY_REUSED`, `PREVIOUS_ATTEMPT_FAILED` o una regla del dominio |
| `GET` | `/orders/:id` | `200 { id, status, charged: { amount, currency }, lines[{ isbn, title, unitPrice: { amount, currency }, quantity }] }` (líneas ordenadas por ISBN). **No incluye la dirección de envío ni el teléfono:** el endpoint no tiene autenticación y cualquiera con el UUID del pedido los vería | `400` (el id no es un UUID) · `404 NOT_FOUND` |
| `GET` | `/books?q=&page=&pageSize=` | `200 { items[{ isbn, title, author, price: { amount, currency } }], page, pageSize, total }`: solo libros activos, ordenados por título y, con el mismo título, por ISBN. `q` busca en el título o el autor sin distinguir mayúsculas (ni ignorar acentos); sin `q` lista todo. `page` ≥ 1 (1 por defecto), `pageSize` de 1 a 50 (20 por defecto) y `total` cuenta toda la búsqueda | `400` (un parámetro inválido o desconocido) |
| `GET` | `/books/:isbn` | `200 { isbn, title, author, price: { amount, currency } }`; acepta el ISBN con o sin guiones y devuelve el normalizado | `404 NOT_FOUND` (no existe o está inactivo) · `422 INVALID_ISBN` (mal formado o con el dígito de control incorrecto) |
| `GET` | `/health/live` | `200` si el proceso responde (liveness; no toca la BD) | — |
| `GET` | `/health/ready` | `200` si la BD responde (readiness; lo usa el balanceador) | `503` |
| `GET` | `/health/outbox` | `200` si el relay de esta instancia sigue completando vueltas; informa `failed` y `due` (lo usa el monitoreo) | `503` |
| `GET` | `/docs` | Swagger UI | — |

**Un pedido tiene una sola moneda.** Si el carrito mezcla libros en monedas distintas, `POST /orders` responde `422 CURRENCY_MISMATCH`. El pedido se cobra en esa moneda (`PEN` o `USD`): `charged.currency` la indica, y el costo de envío y el mínimo de envío gratis dependen de ella. Una moneda sin reglas de precio responde `422 UNSUPPORTED_CURRENCY`.

**Forma del cuerpo de `POST /orders` (`400`):** `customerId` es un UUID; `cardToken` es un texto no vacío (hasta 255 caracteres); `items` es una lista de 1 a 100 líneas con `isbn` (texto no vacío, hasta 32 caracteres) y `quantity` (entero ≥ 1). `shippingAddress` es obligatorio: un objeto con `recipient`, `phone`, `line1`, `district`, `province` y `department` (texto no vacío, hasta 100, 20, 200, 60, 60 y 60 caracteres) y `reference` opcional (hasta 200). Los espacios de los extremos se recortan. Cualquier otro campo se rechaza, así que el cliente no puede mandar precios ni totales. Una lista vacía o una cantidad que no es un entero ≥ 1 se rechazan aquí, con `400`, antes de llegar al dominio.

**Reglas del pedido que `POST /orders` responde con `422`:** `INVALID_SHIPPING_ADDRESS` (la dirección tiene un teléfono que no es un teléfono —dígitos, espacios, `+`, `-` y paréntesis, con al menos 6 dígitos— o caracteres de control como saltos de línea), `INVALID_ISBN` (ISBN mal formado o con el dígito de control incorrecto), `MAX_QUANTITY_EXCEEDED` (más de 10 unidades del mismo libro, sumando líneas repetidas) y `PRICE_MISMATCH` (el mismo libro con dos precios distintos). Las reglas `EMPTY_ORDER` e `INVALID_QUANTITY` siguen existiendo en el dominio, pero por HTTP las intercepta antes la validación del cuerpo.

**Idempotencia de `POST /orders`.** `Idempotency-Key` es un UUID que el cliente genera una vez por intento de compra. Repetir la misma clave con el mismo carrito devuelve el mismo `201` sin cobrar de nuevo; mientras la primera petición sigue en curso, `409 CHECKOUT_IN_PROGRESS`; si el intento anterior falló, `422 PREVIOUS_ATTEMPT_FAILED` (hay que usar una clave nueva); con otro carrito, `422 IDEMPOTENCY_KEY_REUSED`. El ISBN con o sin guiones y la dirección con o sin espacios sobrantes cuentan como el mismo carrito; **otra dirección con la misma clave es otro carrito** (`422 IDEMPOTENCY_KEY_REUSED`).

**El token de la tarjeta** (`cardToken`) solo viaja a la pasarela de pago: no se guarda ni aparece en ninguna respuesta de error ni en los logs. Con la pasarela simulada de desarrollo, `tok_declined` da `422 PAYMENT_DECLINED` y `tok_error` un `500`; cualquier otro token se aprueba.

**Todas las respuestas incluyen el header `X-Request-Id`.** Si la petición lo trae (con formato válido), se devuelve el mismo; si no, uno generado.

**Formato de los montos:** todo monto en la API es un objeto con **texto de 2 decimales y moneda**: `{ "amount": "45.00", "currency": "PEN" }`. Vale para `charged`, `unitPrice` y `price`, así que un libro se ve igual en `GET /books/:isbn` y en la línea del pedido. Punto como separador decimal, sin separador de miles. En `GET /orders/:id`, `unitPrice` (escala 6 en la BD) se muestra con 2 decimales; el valor completo queda en la BD para la facturación.

```ts
// catalog/infrastructure/book/get-book-price.handler.ts (fragmento)
return {
  isbn: book.isbn, title: book.title, author: book.author,
  price: { amount: book.price.toFixed(2), currency: book.currency },   // Prisma.Decimal → texto
};
```
