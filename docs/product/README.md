# LibroYa: carpeta de producto

> Fuente de información del producto. Aquí se define **qué** hace LibroYa y **para quién**; cómo se construye está en [`../backend`](../backend/00-avance.md) y [`../frontend`](../frontend/README.md). Backend y frontend deben apoyarse en esta carpeta.

## Cómo leerla

| Si quieres… | Lee |
|---|---|
| Entender qué es LibroYa y hasta dónde llega | [00-vision-y-alcance](00-vision-y-alcance.md) |
| Saber quién usa el sistema y qué puede hacer cada uno | [01-actores-y-permisos](01-actores-y-permisos.md) |
| Aclarar un término | [02-glosario](02-glosario.md) |
| Calcular un total, validar un dato o conocer un límite | [03-reglas-de-negocio](03-reglas-de-negocio.md) |
| Saber qué debe poder hacer la persona y cómo se comprueba | [04-historias-de-usuario](04-historias-de-usuario.md) |
| Ver los recorridos completos, con sus caminos de error | [05-recorridos](05-recorridos.md) |
| Saber qué pantallas hay y qué muestra cada una | [06-pantallas-y-navegacion](06-pantallas-y-navegacion.md) |
| Escribir un texto, un mensaje de error o dar formato a un monto | [07-contenido-y-mensajes](07-contenido-y-mensajes.md) |
| Conocer los requisitos de móvil, accesibilidad, rendimiento y privacidad | [08-requisitos-de-experiencia](08-requisitos-de-experiencia.md) |
| Ver cómo se ve la tienda: colores, tipografía, componentes y wireframes | [diseno/](diseno/README.md) |
| Ver qué se decidió y qué sigue abierto | [09-decisiones-y-preguntas](09-decisiones-y-preguntas.md) |

## Convenciones

| Prefijo | Qué identifica | Dónde vive |
|---|---|---|
| `RN-nn` | Regla de negocio | [03-reglas-de-negocio](03-reglas-de-negocio.md) |
| `HU-nn` | Historia de usuario | [04-historias-de-usuario](04-historias-de-usuario.md) |
| `PA-nn` | Pantalla | [06-pantallas-y-navegacion](06-pantallas-y-navegacion.md) |
| `DP-nn` | Decisión de producto (o pregunta abierta) | [09-decisiones-y-preguntas](09-decisiones-y-preguntas.md) |

- **Trazabilidad:** una historia (`HU`) cita las reglas (`RN`) que aplica y las pantallas (`PA`) donde ocurre. **Toda tarea de código parte de una historia**: sus tareas, repartidas en `[API]`, `[WEB]`, `[E2E]` y `[DOC]`, están en el archivo de la historia dentro de [`../historias/`](../historias/README.md) (los trabajos técnicos sin historia son habilitadores `EN-nn`). **Desde 2026-10-30 las historias nuevas se redactan en su propio archivo de `historias/`** y se aprueban antes de desglosarlas; las 20 anteriores (`04-historias-de-usuario.md`) son histórico y no se editan.
- **Mantener lo vigente:** los documentos de esta carpeta (`RN`, `DP`, `PA`, contenido, visión…) y `../api-contrato.md` dicen **siempre lo que es verdad hoy**; las historias son el registro de cada cambio. Cada historia nueva declara en su sección «Impacto en el producto» qué documentos toca, el comprobador verifica que quedaron escritos (con la marca `Cambios: HU-nn (fecha)`) y [`cambios.md`](cambios.md) lista, en orden cronológico, qué cambió y por qué historia.
- **Estado** de una historia, en dos columnas: **API** (lo que ofrece el backend) y **Web** (lo que hace `apps/store-web`). En las historias nuevas, el estado, la fecha de cierre y el tiempo están en la matriz de [`../historias/README.md`](../historias/README.md); una historia se cierra cuando todas sus tareas están hechas y su «Listo cuando…» ejecutado de punta a punta (Playwright contra el backend real). Leyenda: ✅ hecho · 🔄 parcial o en curso · ⬜ pendiente · — no aplica.
- **Por decidir:** lo que el producto aún no resolvió se marca así y tiene su `DP-nn` en la carpeta de decisiones. Quien implemente no debe inventar la respuesta: la pregunta se resuelve primero ahí.
- **Idioma:** español. El código y los nombres de endpoints y de campos se citan tal cual están (`POST /orders`, `shippingAddress`).

## Estado de este borrador

Primera versión, escrita a partir de [`../api-contrato.md`](../api-contrato.md), de las guías del backend y del código existente. Después se centralizará aquí toda la información de producto; mientras tanto, si algo de esta carpeta contradice a la API real, gana la API y se corrige esta carpeta.

El corte 7 del backend (autenticación, tareas `7.1` a `7.12`) está **cerrado**; las marcas con su tarea (`7.7`, `7.8`…) que quedan en los documentos son el historial de cuándo se hizo cada cosa. El corte 8 (cotización, `8.1` a `8.4`) también está cerrado: ya no queda nada pendiente del backend para el MVP. Estado: [`../backend/00-avance.md`](../backend/00-avance.md).
