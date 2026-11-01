---
id: HU-nn
titulo: Título corto de la idea
tipo: HU
epica: Catálogo | Cuenta | Carrito | Compra | Pedidos | Administración
estado: idea
amplia:
reemplaza:
---

# HU-nn Título corto de la idea

> **Idea (estado `idea`).** Un pendiente que se anota sin desglosarlo. Cópiala a `docs/historias/fase-n/HU/HU-nn.md` (una historia) o a `docs/historias/fase-n/EN/EN-nn.md` (un habilitador: pon `id: EN-nn` y `tipo: EN` y quita la línea `epica`); el nombre es solo el correlativo, el siguiente libre. Borra esta nota y rellena lo de abajo. Qué admite cada campo está en el [diccionario](README.md). El comprobador solo exige el encabezado: **no** pide criterios, tareas, contrato, pantalla, impacto en el producto ni `ligado:`.

**Qué:** una o dos frases de lo que haría falta.
**Origen:** de dónde sale (un problema abierto, un hallazgo, algo que pidió el usuario) y, si lo hay, el enlace.
**Por qué importa:** qué pasa si no se hace.
**Estado de la decisión:** si ya hay algo decidido o aceptado, dilo aquí (por ejemplo «aceptado mientras haya una sola instancia»).

## Para promoverla a `propuesta`

Copia la plantilla de su tipo ([`HU.md`](HU.md) o [`EN.md`](EN.md)) sobre este archivo, completa sus secciones (criterios, «Listo cuando…», contrato y pantalla si hay tareas `[API]` o `[WEB]`, «Impacto en el producto», tareas con su detalle y, en un habilitador, `ligado:`), pon `estado: propuesta` y espera la aprobación del usuario, como con cualquier historia. Una idea no puede tener tareas hechas ni en curso.
