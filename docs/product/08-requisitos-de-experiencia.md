# Requisitos de experiencia

> Lo que la tienda web debe cumplir más allá de las funciones: dispositivos, accesibilidad, rendimiento, idioma y privacidad. Es una **propuesta de partida** ([DP-19](09-decisiones-y-preguntas.md)): no hay marca ni diseño aprobados todavía, así que estos requisitos se pueden ajustar.

## Dispositivos

| Requisito | Detalle |
|---|---|
| **Móvil primero** | Se diseña primero para pantalla de teléfono y luego se amplía. Todo el recorrido de compra debe poder hacerse con una mano en un teléfono |
| Anchos a cubrir | Desde 360 px de ancho hasta escritorio |
| Navegadores | Las dos últimas versiones de Chrome, Safari, Firefox y Edge |
| Sin horizontal scroll | Ninguna pantalla desborda su ancho |
| Toques | Objetivos táctiles de al menos 44 × 44 px |

## Accesibilidad

Objetivo: **WCAG 2.2 nivel AA**.

- Todo se puede usar solo con teclado, con un foco visible y un orden lógico.
- Contraste de texto suficiente (4.5:1 el normal, 3:1 el grande).
- Los campos de formulario tienen etiqueta visible y asociada; los errores se anuncian a los lectores de pantalla y se indican con texto, no solo con color.
- Los estados de carga y de procesando del pago se anuncian a los lectores de pantalla.
- Los mensajes de la [07](07-contenido-y-mensajes.md) se muestran donde la persona los encuentra (junto al campo o en una región de aviso), no solo en un aviso que desaparece.
- Las imágenes decorativas se ignoran; las informativas llevan texto alternativo.

## Rendimiento

Objetivo de partida (se medirá en un teléfono de gama media con conexión 4G):

| Métrica | Objetivo |
|---|---|
| Contenido principal visible (LCP) | ≤ 2.5 s |
| Respuesta a una interacción (INP) | ≤ 200 ms |
| Saltos de diseño (CLS) | ≤ 0.1 |

- El catálogo carga por páginas de 20; nunca se pide todo el catálogo.
- Las acciones lentas (el pago puede tardar unos segundos) muestran progreso y no dejan la pantalla congelada.

## Idioma y regionalización

- Un solo idioma: **español de Perú (`es-PE`)**. El texto vive en un solo lugar para poder traducirlo después, pero no se traduce ahora.
- Zona horaria de las fechas: Lima (UTC−5). Formato de montos y fechas en [07](07-contenido-y-mensajes.md).

## SEO

No es una prioridad del MVP ([DP-08](09-decisiones-y-preguntas.md)). Aun así, cada pantalla tiene un título de página propio y descriptivo, y la búsqueda y la página del catálogo viven en la URL.

## Seguridad y privacidad percibidas

| Requisito | Detalle |
|---|---|
| **La tarjeta no pasa por LibroYa** | El número de tarjeta nunca se envía, guarda ni registra en LibroYa; solo viaja un `cardToken` (RN-24) |
| **Credenciales en el navegador** | El token de acceso vive solo en memoria y el de refresco en `localStorage` ([DP-16](09-decisiones-y-preguntas.md)). Cerrar sesión borra ambos, y ninguno aparece en la URL, en los logs ni en los mensajes de error |
| **Contraseñas** | Los campos de contraseña permiten pegar y ver/ocultar el texto; no se muestran en ningún mensaje |
| **Datos del pedido** | La dirección y el teléfono solo se muestran a su dueño (RN-42). No se registran en herramientas de análisis |
| **Mensajes de login** | No revelan si un correo existe (RN-33) |
| **Analítica** | Sin analítica en el MVP; si se añade, no incluye datos personales ni de pago |

## Confiabilidad de la compra

- El botón "Pagar" no se puede pulsar dos veces mientras haya un intento en curso.
- La `Idempotency-Key` se conserva en `sessionStorage` mientras dure el intento, aunque se recargue la página, para que el reintento sea seguro (HU-32, DP-14).
- El carrito sobrevive a cerrar sesión, recargar y cerrar el navegador (`localStorage` por usuario, DP-04).
- La dirección de envío no se guarda entre compras (DP-13).
