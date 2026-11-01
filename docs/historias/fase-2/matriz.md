# Matriz de la fase 2

> La genera `python3 scripts/historias.py`: no se edita a mano. El objetivo de la fase está en su [README](README.md); las reglas del proceso y el índice de todas las fases, en el [README de historias](../README.md).

**Leyenda:** estado: 💡 idea (anotada, sin desglosar) · 📝 propuesta (sin aprobar) · ⬜ aprobada · 🔄 en curso · ✅ cerrada. Columnas API y Web: ✅ hecha · 🔄 en curso · ⬜ pendiente · — no aplica. «Cambios de producto» son las filas hechas / el total de su «Impacto en el producto». Las fechas y el tiempo salen de `git log` (hora de Lima, tope de 60 min entre commits); los de la fase 1 son aproximados (≈).

## Historias

### Abiertas (6)

| ID | Historia | Épica | Estado | API | Web | Cambios de producto | Tareas | Fechas y tiempo |
|---|---|---|---|---|---|---|---|---|
| [HU-05](HU/HU-05.md) | Verificar el correo, recuperar y cambiar la contraseña, y cerrar todas las sesiones | Cuenta | 💡 idea | — no aplica | — no aplica | — | 0 / 0 | — |
| [HU-12](HU/HU-12.md) | Ver si hay stock de un libro | Catálogo | 📝 propuesta | ⬜ pendiente | ⬜ pendiente | 0 / 10 | 0 / 5 | — |
| [HU-13](HU/HU-13.md) | Buscar libros ignorando los acentos | Catálogo | 💡 idea | — no aplica | — no aplica | — | 0 / 0 | — |
| [HU-23](HU/HU-23.md) | El carrito marca los libros sin stock suficiente | Carrito | 📝 propuesta | — no aplica | ⬜ pendiente | 0 / 3 | 0 / 2 | — |
| [HU-35](HU/HU-35.md) | El error de pago nombra el libro sin stock | Compra | 📝 propuesta | ⬜ pendiente | ⬜ pendiente | 0 / 3 | 0 / 3 | — |
| [HU-36](HU/HU-36.md) | Cobrar de verdad con una pasarela de pago real | Compra | 💡 idea | — no aplica | — no aplica | — | 0 / 0 | — |

### Cerradas (0)

_Todavía no hay historias cerradas._

## Habilitadores

### Abiertas (9)

| ID | Habilitador | Ligado a | Estado | Tareas | Fechas y tiempo |
|---|---|---|---|---|---|
| [EN-04](EN/EN-04.md) | Ordenar los nombres de archivo que rompen la convención de sufijos | — | 💡 idea | 0 / 0 | — |
| [EN-05](EN/EN-05.md) | Que los operationId de Swagger sean legibles para un generador de código | — | 💡 idea | 0 / 0 | — |
| [EN-06](EN/EN-06.md) | Cerrar o proteger /docs, /docs-json y /health/outbox en producción | — | 💡 idea | 0 / 0 | — |
| [EN-07](EN/EN-07.md) | Compartir los contadores del límite de intentos entre instancias | — | 💡 idea | 0 / 0 | — |
| [EN-08](EN/EN-08.md) | Poner un límite de intentos propio a POST /orders/quote | — | 💡 idea | 0 / 0 | — |
| [EN-09](EN/EN-09.md) | Aclarar si la compuerta verify.sh incluye la auditoría de dependencias | — | 💡 idea | 0 / 0 | — |
| [EN-10](EN/EN-10.md) | Poner un tiempo máximo a cada entrega del relay del Outbox | — | 💡 idea | 0 / 0 | — |
| [EN-11](EN/EN-11.md) | Vigilar los fallos intermitentes de las pruebas | — | 💡 idea | 0 / 0 | — |
| [EN-14](EN/EN-14.md) | La matriz de cada fase, con una sola tabla de historias y una de habilitadores | [guia-de-desarrollo.md](../../guia-de-desarrollo.md) | ⬜ aprobada | 0 / 2 | — |

### Cerradas (5)

| ID | Habilitador | Ligado a | Estado | Cierre y tiempo |
|---|---|---|---|---|
| [EN-01](EN/EN-01.md) | Ordenar application/services/ de Ventas e Identidad | [backend/05-piezas-clave.md#convención-por-contexto](../../backend/05-piezas-clave.md#convención-por-contexto) | ✅ cerrada | 2026-10-31 · 0 min |
| [EN-02](EN/EN-02.md) | Comprobación final de toda la solución | [guia-de-desarrollo.md](../../guia-de-desarrollo.md) | ✅ cerrada | 2026-10-31 · 37 min |
| [EN-03](EN/EN-03.md) | Congelar los archivos de avance y no duplicar la información | [guia-de-desarrollo.md](../../guia-de-desarrollo.md) | ✅ cerrada | 2026-10-31 · 25 min |
| [EN-12](EN/EN-12.md) | Una matriz por fase, con historias y habilitadores separados | [guia-de-desarrollo.md](../../guia-de-desarrollo.md) | ✅ cerrada | 2026-10-31 · 53 min |
| [EN-13](EN/EN-13.md) | Carpetas HU y EN por fase, plantillas con su diccionario y legado.json ordenado | [guia-de-desarrollo.md](../../guia-de-desarrollo.md) | ✅ cerrada | 2026-10-31 · 1 h 11 min |
