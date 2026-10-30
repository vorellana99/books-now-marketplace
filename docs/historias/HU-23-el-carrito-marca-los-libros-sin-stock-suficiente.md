---
id: HU-23
titulo: El carrito marca los libros sin stock suficiente
tipo: HU
epica: Carrito
estado: propuesta
amplia: HU-22
---

# HU-23 El carrito marca los libros sin stock suficiente

> **Estado:** 📝 propuesta, pendiente de aprobación. **Amplía** [HU-22](../product/04-historias-de-usuario.md#hu-22-ver-el-carrito) (histórica, no se edita): su criterio «la pantalla no promete disponibilidad» deja de valer cuando exista [HU-12](HU-12-ver-si-hay-stock-de-un-libro.md). Depende de ella: usa la disponibilidad que el catálogo devuelve.

**Como** comprador, **quiero** que el carrito me diga qué libros ya no alcanzan, **para** corregirlo antes de pagar y no enterarme en el pago.
**Reglas:** RN-10, RN-13 (reescrita en `HU-12.1`) · **Pantallas:** PA-05, PA-06 · **Rutas:** `GET /books/:isbn` (la tienda ya lo consulta al abrir el carrito)

## Criterios

- **Dado** un libro agotado en mi carrito, **cuando** lo abro, **entonces** su línea dice «Agotado: quítalo para continuar» (con el título) y no puedo continuar con la compra.
- **Dado** un libro del que quedan 3 y tengo 5 en el carrito, **cuando** lo abro, **entonces** la línea dice «Solo quedan 3: baja la cantidad», el selector de cantidad ofrece solo de 1 a 3 y no puedo continuar hasta resolverlo.
- **Dado** que entro directo a la pantalla de pago con libros sin stock suficiente, **cuando** carga, **entonces** veo qué libros son (por su título) y un enlace para volver al carrito.
- **Dado** el aviso, **cuando** la cantidad se ajusta, **entonces** nunca se cambia en silencio: la persona la baja o quita el libro.

## Listo cuando

Contra el backend real, con un libro agotado y otro con 3 unidades en el carrito: el carrito marca cada uno por su título, el selector se limita, «Continuar con la compra» queda deshabilitado, y entrar directo a `/compra` nombra los libros; al quitar uno y bajar la cantidad del otro se puede continuar.

## Contrato

**Sin cambios en el contrato.** Solo consume el campo `available` de `GET /books/:isbn` que añade [HU-12](HU-12-ver-si-hay-stock-de-un-libro.md#contrato).

## Pantalla

> Lo que se aprueba con la historia. Reutiliza el aviso rojo de «No disponible» que ya tiene la línea del carrito, el componente `Alert` y la nota de disponibilidad de [HU-12](HU-12-ver-si-hay-stock-de-un-libro.md#pantalla).

**Línea del carrito** (`PA-05`): debajo del título, el autor y el precio, un bloque con el mensaje, con el **mismo estilo que el de «No disponible»**; cuando hay problema el selector se limita a `1..min(10, disponibles)`.

```
┌──────────────────────────────────────────┐
│ Clean Code                               │
│ Robert C. Martin · S/ 45.00              │
│ ┌──────────────────────────────────────┐ │
│ │ ⚠ Solo quedan 3: baja la cantidad    │ │ ← mensaje nuevo (aviso)
│ └──────────────────────────────────────┘ │
│ Cantidad [5 ▾]  → opciones 1 a 3  [Quitar]│
└──────────────────────────────────────────┘
```

| Situación | Mensaje de la línea | Selector |
|---|---|---|
| Agotado | `Agotado: quítalo para continuar` (tono de error) | Sin opciones útiles: solo «Quitar» |
| Hay menos que las del carrito | `Solo quedan N: baja la cantidad` (tono de aviso) | De 1 a N |
| Hay suficientes | (nada) | De 1 a min(10, disponibles) |

**Arriba de la lista** (solo si hay algún problema): un `Alert` de aviso que **nombra los libros** por su título: «Hay libros sin stock suficiente: «Clean Code» (quedan 3), «Domain-Driven Design» (agotado).»

**Botón «Continuar con la compra»:** deshabilitado mientras haya problemas, con el estilo de deshabilitado que ya tiene; bajo él, una línea pequeña: «Resuelve los libros marcados para continuar.»

**Pantalla de pago directa (`PA-06`, `/compra`):** el mismo `EmptyState` que hoy se muestra con un libro no disponible, con el título «Hay libros en tu carrito sin stock suficiente.», la lista de títulos y el botón «Volver al carrito».

**Móvil y escritorio:** el mensaje ocupa todo el ancho de la línea en 360 px y se alinea a la izquierda en 1280 px; el `Alert` de arriba y el botón no cambian de lugar. Todo con texto además del color; objetivos táctiles de al menos 44 px; se revisa en un navegador real a 360 y 1280 px y con axe en `HU-23.2`.

## Tareas

| # | Capa | Tipo | Rigor | Tarea | Objetivo | Depende de | Estado |
|---|---|---|---|---|---|---|---|
| HU-23.1 | 🌐 WEB | 🖼️ pantalla | 🟢 normal | El carrito y la compra marcan los libros sin stock suficiente | Que la persona se entere en el carrito, y no en el pago, de qué libro ya no alcanza | HU-12.4 | ✏️ propuesta |
| HU-23.2 | 🧪 E2E | 🔁 recorrido | 🟢 normal | El carrito sin stock de punta a punta | Comprobar con el backend real que el carrito bloquea y explica antes de pagar | HU-23.1 | ✏️ propuesta |

## Detalle de las tareas

### HU-23.1 El carrito y la compra marcan los libros sin stock suficiente

**Se comprueba**

- [ ] `use-cart-revalidation.ts` expone `available` por ISBN y `stockProblems` (`{isbn, title, available}`)
- [ ] `cart-line.tsx`: mensaje con el título y selector de 1 a min(10, disponibles)
- [ ] `cart-page.tsx`: alerta que lista los libros y «Continuar» deshabilitado
- [ ] `checkout-page.tsx`: `EmptyState` que nombra los libros y vuelve al carrito
- [ ] no se corrige la cantidad en silencio
- [ ] pruebas: `cart-revalidation`, `cart-page` (el test «selector de 1 a 10» pasa a ser dinámico) y `checkout-page`
- [ ] revisado en un navegador real a 360 y 1280 px contra la sección **Pantalla**, con la captura anotada en la bitácora

### HU-23.2 El carrito sin stock de punta a punta

**Se comprueba**

- [ ] un libro agotado y otro con 3 unidades (por la API de administración): el carrito los marca por su título
- [ ] el selector se limita y «Continuar» no deja avanzar
- [ ] entrar directo a `/compra` nombra los libros
- [ ] al quitar uno y bajar la cantidad del otro, se puede comprar
- [ ] axe sin violaciones a 360 y 1280 px

## Decisiones y desvíos

| Fecha | Qué se decidió o se desvió | Por qué |
|---|---|---|
| 2026-10-30 | Un libro agotado o sin cantidad suficiente **no deja continuar** (recomendado, cambiable al aprobar) | Evita pagar para descubrirlo; el pago sigue siendo la autoridad ([HU-35](HU-35-el-error-de-pago-nombra-el-libro.md)) |
| 2026-10-30 | No se corrige la cantidad en silencio | Cambiar lo que la persona eligió sin decirlo sorprende; además `useQuote` se desactiva con libros bloqueados y la pantalla de pago ya sustituye todo con un aviso en ese caso |

## Bitácora

| Fecha | Qué se hizo |
|---|---|
| 2026-10-30 | Propuesta redactada y desglosada en 2 tareas. Sin código |
