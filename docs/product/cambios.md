# Registro de cambios del producto

> Las reglas (`RN`), pantallas (`PA`), decisiones (`DP`) y demás documentos de esta carpeta dicen **siempre lo que es verdad hoy**; este registro dice qué historia cambió cada uno y cuándo. Lo genera `python3 scripts/historias.py` desde la sección «Impacto en el producto» de cada historia (`docs/historias/`): no se edita a mano. Una fila *pendiente* es un cambio aprobado o propuesto que todavía no está escrito en el documento vivo.

<!-- CAMBIOS:INICIO (la genera scripts/historias.py: no editar a mano) -->
| Fecha | Historia | Documento | Acción | Qué cambia | Estado |
|---|---|---|---|---|---|
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [RN-13](03-reglas-de-negocio.md) | modifica | La API expone una disponibilidad orientativa con tope 10, no la cantidad real | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [DP-05](09-decisiones-y-preguntas.md) | modifica | «Stock visible» deja de ser pendiente de API (y sale de la lista de preguntas abiertas de ese documento) | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [DP-25](09-decisiones-y-preguntas.md) | agrega | Disponibilidad orientativa con tope 10, dentro de `GET /books*` | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [PA-01](06-pantallas-y-navegacion.md) | modifica | La tarjeta muestra la nota de disponibilidad y el botón respeta el límite | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [PA-02](06-pantallas-y-navegacion.md) | modifica | El detalle muestra la nota de disponibilidad y el botón respeta el límite | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [product/00-vision-y-alcance.md](00-vision-y-alcance.md) | modifica | «Stock visible» sale de «fuera de alcance» | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [product/07-contenido-y-mensajes.md](07-contenido-y-mensajes.md) | modifica | Textos de la nota de disponibilidad: «Disponible», «Quedan N», «Agotado», «Solo quedan N» | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [product/diseno/03-wireframes.md](diseno/03-wireframes.md) | modifica | Wireframes de PA-01 y PA-02 con la nota de disponibilidad | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [product/diseno/mockups/index.html](diseno/mockups/index.html) | modifica | El mockup del detalle con la nota de disponibilidad | pendiente |
| — | [HU-12](../historias/fase-2/HU/HU-12.md) | [api-contrato.md](../api-contrato.md) | modifica | `available` en `GET /books` y `GET /books/:isbn` | pendiente |
| — | [HU-23](../historias/fase-2/HU/HU-23.md) | [PA-05](06-pantallas-y-navegacion.md) | modifica | La línea del carrito marca «Agotado» o «Solo quedan N», limita la cantidad y bloquea «Continuar con la compra» | pendiente |
| — | [HU-23](../historias/fase-2/HU/HU-23.md) | [PA-06](06-pantallas-y-navegacion.md) | modifica | Entrar directo a la compra con libros sin stock nombra los libros y vuelve al carrito | pendiente |
| — | [HU-23](../historias/fase-2/HU/HU-23.md) | [product/07-contenido-y-mensajes.md](07-contenido-y-mensajes.md) | modifica | Textos del carrito: «Agotado: quítalo para continuar», «Solo quedan N: baja la cantidad» | pendiente |
| — | [HU-35](../historias/fase-2/HU/HU-35.md) | [PA-06](06-pantallas-y-navegacion.md) | modifica | El aviso de falta de stock nombra el libro (solo cambia el texto) | pendiente |
| — | [HU-35](../historias/fase-2/HU/HU-35.md) | [product/07-contenido-y-mensajes.md](07-contenido-y-mensajes.md) | modifica | Textos de `OUT_OF_STOCK` y `STOCK_ITEM_NOT_FOUND` con el título del libro | pendiente |
| — | [HU-35](../historias/fase-2/HU/HU-35.md) | [api-contrato.md](../api-contrato.md) | modifica | `isbn` en el cuerpo del `422` de `OUT_OF_STOCK` y `STOCK_ITEM_NOT_FOUND` | pendiente |
<!-- CAMBIOS:FIN -->
