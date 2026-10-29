# LibroYa: diseño

> Cómo se ve y se siente la tienda web. Es una **propuesta de partida**: no hay marca ni Figma ([DP-19](../09-decisiones-y-preguntas.md)), así que la paleta, la tipografía y los textos se pueden cambiar. Lo que **no** debería cambiar sin pensarlo son los requisitos de [08-requisitos-de-experiencia](../08-requisitos-de-experiencia.md) (móvil primero, accesibilidad AA).

| Documento | Contenido |
|---|---|
| [01-tokens](01-tokens.md) | Colores (con sus contrastes calculados), tipografía, espaciado, bordes y movimiento, escritos como variables |
| [02-componentes](02-componentes.md) | Qué componentes de shadcn/ui se usan, cuáles son propios y cómo se comportan |
| [03-wireframes](03-wireframes.md) | Las diez pantallas (`PA-01` a `PA-10`) en móvil, con sus estados y las diferencias en escritorio |

## Dirección visual

**Librería editorial y cálida** ([DP-22](../09-decisiones-y-preguntas.md)). Una librería, no un comercio de electrónicos.

| Principio | Cómo se nota |
|---|---|
| **Papel y tinta** | Fondo crema en lugar de blanco puro, texto casi negro, un solo color de acento (granate) |
| **Títulos con serif** | Los títulos de página y de libro usan una serif; todo lo demás, una sans-serif legible |
| **Mucho aire** | Espaciado generoso, líneas de texto cortas, pocas cajas y bordes |
| **El dinero, siempre claro** | Los montos se alinean, tienen el mismo peso en todas partes y el **total** es lo más visible en el carrito y el pago |
| **Calma al pagar** | El paso de pago tiene pocos elementos, ningún elemento promocional y estados claros de "procesando" y de error |
| **Honestidad** | Un error dice qué pasó, si se cobró y qué hacer (el tono está en [07](../07-contenido-y-mensajes.md)) |

## Alcance

- **Solo modo claro** en el MVP ([DP-22](../09-decisiones-y-preguntas.md)). Todos los colores son variables, así que el modo oscuro se añade después definiendo otro conjunto de valores, sin tocar los componentes.
- **Móvil primero** (360 px de ancho mínimo), ampliado a escritorio. Los wireframes muestran el móvil y describen lo que cambia en pantallas grandes.
- **Sin portadas** en el MVP (DP-05): el libro se representa con una *portada tipográfica* generada ([02-componentes](02-componentes.md#portada-tipográfica)). Cuando la API entregue la imagen real, ocupa su lugar sin rediseñar nada.
- **Sin ilustraciones ni fotografías.** Los iconos son los de una librería de iconos de línea (`lucide`, la que usa shadcn/ui).

## Cuándo se diseña

Lo mínimo antes de empezar y cada pantalla **justo antes** de construirla en su corte ([DP-23](../09-decisiones-y-preguntas.md)):

| Antes de | Hay que tener |
|---|---|
| `F0` Fundaciones | Los [tokens](01-tokens.md) y la cabecera de [03-wireframes](03-wireframes.md#cabecera-y-navegación) (este documento) |
| `F1` Catálogo | Los wireframes de `PA-01`, `PA-02` y `PA-10` |
| `F2` Cuenta | `PA-03` y `PA-04` |
| `F3` Carrito | `PA-05` |
| `F4` Compra | `PA-06` y `PA-07` |
| `F5` Pedidos | `PA-08` y `PA-09` |

Los wireframes de todas las pantallas ya están en esta primera versión. Antes de construir cada una se **revisan**: si al verla en el navegador algo no funciona, se corrige aquí y no solo en el código.

## Cómo se cambia el diseño

1. **Colores, tipografía, espaciado:** se cambian en [01-tokens](01-tokens.md) y en el único archivo de estilos del frontend (`src/styles.css`). Los componentes no llevan colores propios.
2. **Un componente:** se cambia en [02-componentes](02-componentes.md) y en `shared/ui/`.
3. **Una pantalla:** se cambia su wireframe en [03-wireframes](03-wireframes.md), y se actualizan sus historias en [04](../04-historias-de-usuario.md) si cambia el comportamiento.
4. **Si llega una marca real** (logotipo, paleta, tipografía), solo cambian los valores de los tokens y el logotipo de la cabecera.
