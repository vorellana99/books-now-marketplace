# LibroYa API: contrato

> Rutas, respuestas, errores y formato de montos. Es lo que consume el frontend; la implementación está en [backend/05-piezas-clave.md](backend/05-piezas-clave.md).

## 8. Endpoints

| Método | Ruta | Respuesta | Errores (`errorCode`) |
|---|---|---|---|
| `POST` | `/orders` (header `Idempotency-Key`) | `201 { orderId, charged: { amount: "90.00", currency: "PEN" } }`, también al reintentar una compra completada | `400` DTO o falta la clave · `404 NOT_FOUND` · `409 CHECKOUT_IN_PROGRESS` · `422 OUT_OF_STOCK`, `PAYMENT_DECLINED`, `IDEMPOTENCY_KEY_REUSED`, `PREVIOUS_ATTEMPT_FAILED` o una regla del dominio |
| `GET` | `/orders/:id` | `200 { id, status, charged: { amount, currency }, lines[{ isbn, title, unitPrice: { amount, currency }, quantity }] }` | `404` |
| `GET` | `/books/:isbn` | `200 { isbn, title, author, price: { amount, currency } }`; acepta el ISBN con o sin guiones y devuelve el normalizado | `404 NOT_FOUND` (no existe o está inactivo) · `422 INVALID_ISBN` (mal formado o con el dígito de control incorrecto) |
| `GET` | `/health/live` | `200` si el proceso responde (liveness; no toca la BD) | — |
| `GET` | `/health/ready` | `200` si la BD responde (readiness; lo usa el balanceador) | `503` |
| `GET` | `/health/outbox` | `200` si el relay de esta instancia sigue completando vueltas; informa `failed` y `due` (lo usa el monitoreo) | `503` |
| `GET` | `/docs` | Swagger UI | — |

**Un pedido tiene una sola moneda.** Si el carrito mezcla libros en monedas distintas, `POST /orders` responde `422 CURRENCY_MISMATCH`. El pedido se cobra en esa moneda (`PEN` o `USD`): `charged.currency` la indica, y el costo de envío y el mínimo de envío gratis dependen de ella. Una moneda sin reglas de precio responde `422 UNSUPPORTED_CURRENCY`.

**Reglas del pedido que `POST /orders` responde con `422`:** `INVALID_ISBN` (ISBN mal formado), `INVALID_QUANTITY` (la cantidad no es un entero ≥ 1), `MAX_QUANTITY_EXCEEDED` (más de 10 unidades del mismo libro, sumando líneas repetidas), `EMPTY_ORDER` (carrito sin libros) y `PRICE_MISMATCH` (el mismo libro con dos precios distintos).

**Todas las respuestas incluyen el header `X-Request-Id`.** Si la petición lo trae (con formato válido), se devuelve el mismo; si no, uno generado.

**Formato de los montos:** todo monto en la API es un objeto con **texto de 2 decimales y moneda**: `{ "amount": "45.00", "currency": "PEN" }`. Vale para `charged`, `unitPrice` y `price`, así que un libro se ve igual en `GET /books/:isbn` y en la línea del pedido. Punto como separador decimal, sin separador de miles. En `GET /orders/:id`, `unitPrice` (escala 6 en la BD) se muestra con 2 decimales; el valor completo queda en la BD para la facturación.

```ts
// catalog/infrastructure/book/get-book-price.handler.ts (fragmento)
return {
  isbn: book.isbn, title: book.title, author: book.author,
  price: { amount: book.price.toFixed(2), currency: book.currency },   // Prisma.Decimal → texto
};
```
