# Componentes

> Qué piezas de interfaz usa la tienda, de dónde salen y cómo se comportan. Los de **shadcn/ui** se copian al repositorio en `shared/ui/` y se ajustan con los [tokens](01-tokens.md); los **propios** los escribe el proyecto en `shared/ui/` (genéricos) o dentro de la funcionalidad que los usa. Los textos están en [07](../07-contenido-y-mensajes.md).

## De shadcn/ui (se añaden a medida que un corte los necesita)

| Componente | Dónde se usa | Notas de comportamiento |
|---|---|---|
| `Button` | Todas | Variantes: **principal** (granate, una por pantalla), **secundario**, **fantasma** (enlaces de acción) y **destructivo** (solo "Quitar" si pide confirmar). Alto mínimo 44 px. Deshabilitado mientras hay una petición en curso |
| `Input`, `Label` | PA-03, PA-04, PA-06, buscador | Etiqueta siempre visible y asociada; nunca solo *placeholder*. Texto de 16 px o más. Borde con `--input` |
| `Form` (con React Hook Form) | PA-03, PA-04, PA-06 | Conecta etiqueta, campo, ayuda y error con `aria-describedby`; el campo inválido lleva `aria-invalid` |
| `Card` | Tarjetas de libro, pedido y resumen | Borde de 1 px, sin sombra salvo menús |
| `Badge` | "Envío gratis", estado del pedido, "No disponible" | Siempre con texto, nunca solo color |
| `Alert` | Errores y avisos de la compra, sesión terminada, precio cambiado | Variantes `error`, `warning`, `info`, `success`; con icono. Los de error y de procesando se anuncian a los lectores de pantalla (`role="alert"` / `role="status"`) |
| `Skeleton` | Estado de carga | Con las dimensiones del contenido final (sin saltos de diseño) |
| `Sheet` | Menú de la cabecera en móvil | Atrapa el foco, se cierra con `Esc`, devuelve el foco al botón que lo abrió |
| `DropdownMenu` | Menú de la cuenta en escritorio | Navegable con flechas |
| `Separator` | Resumen, líneas de pedido | Decorativo (`--border`) |
| `Sonner` (avisos breves) | "Libro agregado" con deshacer, "Quitado del carrito" con deshacer | En una región `aria-live="polite"`; dura al menos 6 s y se detiene al pasar el cursor o enfocar. Nada crítico va solo en un aviso breve |

El selector de cantidad **no** es un componente propio: es un `<select>` nativo con el estilo de `Input` (de 1 a 10). Es accesible, rápido en móvil y evita reinventar un control.

## Propios

### Portada tipográfica

Sustituye a la imagen de portada mientras la API no la entregue (DP-05).

- Relación de aspecto 2:3. Tres tamaños: pequeño (56 × 84, en filas), mediano (96 × 144, en tarjetas) y grande (160 × 240, en el detalle).
- Fondo: uno de los seis [colores de portada](01-tokens.md#colores-de-la-portada-tipográfica), elegido de forma **estable** a partir del ISBN (el mismo libro siempre tiene el mismo color).
- Contenido: título en serif blanco, hasta tres líneas (el resto se corta con puntos suspensivos), y el autor debajo en pequeño. Un filo vertical claro a la izquierda sugiere el lomo.
- Es **decorativa** (`alt=""`): el título y el autor ya están en el texto de al lado, así que un lector de pantalla no los repite.
- Cuando exista la imagen real, el componente muestra la imagen y conserva la portada tipográfica como *fallback* mientras carga o si falla.

### `Price`

Muestra un monto con el formato de [07](../07-contenido-y-mensajes.md#montos-fechas-y-números) (`S/ 90.00`, `90.00 USD`) usando `formatMoney`; nunca recibe un `number`.

- Cifras tabulares, para que los montos de una columna alineen.
- Tamaños: normal, grande (totales).
- Para lectores de pantalla, un precio unitario se anuncia con su contexto ("90 soles con 00 céntimos" sale del texto; el componente añade el nombre del concepto como texto visible, p. ej. "Total a pagar").

### `BookCard`

Tarjeta de un libro en el catálogo (`PA-01`).

- Móvil: **fila** (portada pequeña a la izquierda; título, autor y precio a la derecha; botón "Agregar" debajo del precio). Desde `sm`: tarjeta vertical en rejilla.
- Todo el título es un enlace al detalle; el botón "Agregar" es independiente (no navega).
- El título es `h3`; el autor, texto atenuado; el precio, `Price`.
- Estado "En el carrito (n)" cuando el libro ya está: el botón pasa a "Agregar otro".

### `CartLine`

Una línea de `PA-05`.

- Portada pequeña, título (enlace), autor, precio unitario, selector de cantidad (1 a 10), subtotal de la línea (de la cotización, DP-20) y "Quitar".
- Variantes: **normal**, **precio cambiado** (aviso `warning` con el precio nuevo) y **no disponible** (atenuada, con aviso, sin selector; bloquea continuar hasta quitarla).
- El selector y "Quitar" llevan una etiqueta que nombra el libro ("Cantidad de Clean Code", "Quitar Clean Code").

### `OrderSummary`

El resumen de montos de `PA-05`, `PA-06` y `PA-07`.

- Filas: subtotal, descuento (solo si lo hay, con signo menos), envío ("Gratis" o su costo) y **total a pagar** (monto grande, peso mayor, separado por una línea).
- Estado **cotizando**: los montos se atenúan y se anuncia "Calculando tu total…" (región `aria-live`); no se puede continuar.
- Estado **error**: un `Alert` "No pudimos calcular tu total" con "Reintentar".
- Debajo, la regla de envío en texto pequeño y atenuado.

### `StatePanel`

Cuatro variantes que usan todas las pantallas con datos ([04](../../frontend/04-flujos-de-pantalla.md#2-estados-de-toda-pantalla-con-datos)):

| Variante | Contenido |
|---|---|
| **Vacío** | Icono de línea, mensaje y una acción ("Ver libros") |
| **Error** | Mensaje genérico, botón "Reintentar" y el **código de soporte** (`requestId`) en texto pequeño y copiable |
| **No encontrado** | "No está disponible" con un enlace a un lugar útil |
| **Cargando** | Esqueleto de la pantalla (no un indicador giratorio solo) |

### `PasswordInput`

Campo de contraseña con botón **ver / ocultar**. Permite pegar. No muestra la contraseña en ningún mensaje. La ayuda "Al menos 10 caracteres" es visible desde el principio, no solo cuando falla.

### `SearchBox`

Campo de búsqueda: `role="search"`, etiqueta "Buscar por título o autor" y botón para limpiar cuando hay texto. **El de la cabecera se envía con `Enter` y no lleva botón de enviar**: un botón oculto sería una parada de teclado invisible (se vio al revisar la tienda en el navegador). El de la propia página del catálogo (`PA-01`) sí lleva el botón "Buscar" visible.

### `Pagination`

"‹ Anterior · Página 1 de 5 · Siguiente ›". Los botones deshabilitados lo están realmente (`disabled`), y el cambio de página mueve el foco al principio de la lista.

### `PaymentStatus`

Panel del paso de pago que cambia con la máquina de estados de [04](../../frontend/04-flujos-de-pantalla.md#5-pago-pa-06):

| Estado | Variante | Anuncio |
|---|---|---|
| Procesando | `info`, con indicador y "No cierres esta página" | `role="status"` |
| Esperando | `info` ("Estamos procesando tu pago…") | `role="status"` |
| Incierto | `warning` con "Reintentar" | `role="alert"` |
| Fallido | `error`, con mensaje, si se cobró, y acción | `role="alert"` |

### Cabecera

Detallada en [03-wireframes](03-wireframes.md#cabecera-y-navegación). El contador del carrito está en una región `aria-live="polite"` ("Carrito, 3 libros").

## Accesibilidad común

- **Foco visible siempre**: anillo de 2 px con 2 px de separación (`--ring`).
- **Objetivos táctiles de 44 × 44 px** mínimo, también los iconos de la cabecera.
- **Orden de tabulación** igual al orden visual; sin `tabindex` positivo.
- **Un `h1` por pantalla**; los títulos no se saltan niveles.
- **Los errores de un formulario** se muestran junto al campo y el foco pasa al primero con error al enviar.
- **Enlace "Saltar al contenido"** como primer elemento de la página.
- **Sin información solo en color, icono ni posición.**
- **Idioma de la página** `es-PE`, para que los lectores de pantalla pronuncien bien.
