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

> **Idea (estado `idea`).** Un pendiente que se anota sin desglosarlo. Qué admite cada campo está en el [diccionario](README.md). El comprobador solo exige el encabezado: **no** pide criterios, tareas, contrato, pantalla, impacto en el producto ni `ligado:`. Borra esta nota y rellena lo de abajo.
>
> **Al copiar la idea**
>
> | Si es… | Cópiala a | Cambia en el encabezado |
> |---|---|---|
> | Una historia | `docs/historias/fase-n/HU/HU-nn.md` | Nada: conserva `tipo: HU` y `epica` |
> | Un habilitador | `docs/historias/fase-n/EN/EN-nn.md` | `id: EN-nn`, `tipo: EN` y quita la línea `epica` |
>
> El nombre es solo el correlativo: el siguiente libre de ese tipo.
>
> Los estados por los que pasa, de la idea a la historia cerrada (el significado completo está en el [diccionario](README.md#estados-de-una-historia-o-un-habilitador)):
>
> **Estados de una historia o un habilitador**
>
> | Valor | Icono | Qué significa | Cuándo se pone |
> |---|---|---|---|
> | `idea` | 💡 | Un pendiente anotado, sin desglosar | Al crear el archivo desde [`idea.md`](idea.md) |
> | `propuesta` | 📝 | Desglosada y a la espera de aprobación | Al desglosarla (`/hu`) o al promover una idea |
> | `aprobada` | ⬜ | Aprobada por el usuario: puede ejecutarse | Cuando el usuario la aprueba |
> | `en-curso` | 🔄 | Alguna de sus tareas ya empezó | Al pasar su primera tarea a `en-curso` |
> | `cerrada` | ✅ | Todas sus tareas están hechas y su «Listo cuando…» se ejecutó | Al terminar la última tarea (en una historia, tras su `[E2E]`) |

| Campo | Contenido |
|---|---|
| Qué | Una o dos frases de lo que haría falta |
| Origen | De dónde sale (un problema abierto, un hallazgo, algo que pidió el usuario) y, si lo hay, el enlace |
| Por qué importa | Qué pasa si no se hace |
| Estado de la decisión | Si ya hay algo decidido o aceptado, dilo aquí (por ejemplo «aceptado mientras haya una sola instancia») |

## Para promoverla a `propuesta`

| Paso | Qué se hace |
|---|---|
| 1 | Copia la plantilla de su tipo ([`HU.md`](HU.md) o [`EN.md`](EN.md)) sobre este archivo |
| 2 | Completa sus secciones: criterios, «Listo cuando…», contrato y pantalla si hay tareas `[API]` o `[WEB]`, «Impacto en el producto», tareas con su detalle y, en un habilitador, `ligado:` |
| 3 | Pon `estado: propuesta` |
| 4 | Espera la aprobación del usuario, como con cualquier historia |

Una idea no puede tener tareas hechas ni en curso.
