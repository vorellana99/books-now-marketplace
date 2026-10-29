# Wireframes

> Las diez pantallas de [06-pantallas-y-navegacion](../06-pantallas-y-navegacion.md), en **móvil (360 px)**, con sus estados y lo que cambia en escritorio. Son **esquemas de estructura y jerarquía**, no diseño final: dicen qué hay, en qué orden y qué se destaca. Los componentes están en [02](02-componentes.md), los valores en [01](01-tokens.md) y los textos en [07](../07-contenido-y-mensajes.md).

**Cómo leerlos:** `[ Texto ]` es un botón; `[ Texto ▾ ]` un selector; `(Texto)` una insignia; `░░░` un esqueleto de carga; `▓` una portada tipográfica; `═══` el elemento principal de la pantalla.

## Cabecera y navegación

Está en todas las pantallas. Enlace "Saltar al contenido" antes de ella.

```text
Móvil (cerrado)                        Móvil (menú abierto: hoja lateral)
┌────────────────────────────────┐     ┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │     │ ✕                              │
└────────────────────────────────┘     │ Libros                         │
                                       │ Mis pedidos          (con sesión)│
                                       │ ──────────────────────────────  │
  🔍 abre el buscador debajo           │ ana@example.com      (con sesión)│
  🛒 lleva a /carrito                  │ [ Cerrar sesión ]              │
                                       │  — o, sin sesión —             │
                                       │ [ Entrar ]  Crear cuenta       │
                                       └────────────────────────────────┘
```

**Escritorio:** logotipo a la izquierda, buscador ancho al centro, y a la derecha "Mis pedidos", el carrito con su contador y el menú de la cuenta (o "Entrar" y "Crear cuenta"). El menú de la cuenta tiene el correo y "Cerrar sesión".

**Sin sesión:** "Mis pedidos" no aparece; el carrito sí (lleva a iniciar sesión, HU-20). **Estados:** el contador solo aparece si hay libros.

---

## PA-01 Catálogo y búsqueda

`/` · público · [HU-10](../04-historias-de-usuario.md#hu-10-buscar-libros)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │
├────────────────────────────────┤
│ Libros                      h1 │
│ ┌────────────────────┐         │
│ │ 🔍 Título o autor ✕│[Buscar] │
│ └────────────────────┘         │
│ 24 resultados para «clean»     │
│ [ Limpiar búsqueda ]           │
│                                │
│ ┌────────────────────────────┐ │
│ │ ▓▓▓▓  Clean Code        h3 │ │
│ │ ▓▓▓▓  Robert C. Martin     │ │
│ │ ▓▓▓▓  S/ 90.00             │ │
│ │       [ Agregar ]          │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ▓▓▓▓  Clean Architecture   │ │
│ │ ▓▓▓▓  Robert C. Martin     │ │
│ │ ▓▓▓▓  S/ 110.00            │ │
│ │       [ Agregar otro (1) ] │ │
│ └────────────────────────────┘ │
│            …20 por página      │
│                                │
│ [‹ Anterior] Página 1 de 2 [Siguiente ›] │
└────────────────────────────────┘
```

**Estados**

| Estado | Qué se ve |
|---|---|
| Cargando | Seis tarjetas de esqueleto (`░░░`) con la forma de `BookCard` |
| Sin resultados | `StatePanel` vacío: "No encontramos libros para «x». Prueba con otro título o autor." y [ Limpiar búsqueda ] |
| Error | `StatePanel` de error con [ Reintentar ] y el código de soporte |
| Sin búsqueda | Sin la línea de "n resultados" ni el botón de limpiar; solo la lista |

**Escritorio:** rejilla de 3 columnas desde 768 px y de 4 desde 1024 (tarjetas verticales: portada mediana arriba, luego título, autor, precio y botón). El buscador de la cabecera y el de la página son el mismo campo.

---

## PA-02 Detalle del libro

`/libros/:isbn` · público · [HU-11](../04-historias-de-usuario.md#hu-11-ver-un-libro)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │
├────────────────────────────────┤
│ ‹ Volver a los libros          │
│                                │
│        ┌────────────┐          │
│        │ ▓▓▓▓▓▓▓▓▓▓ │  portada │
│        │ ▓▓▓▓▓▓▓▓▓▓ │  grande  │
│        └────────────┘          │
│                                │
│ Clean Code                  h1 │
│ Robert C. Martin               │
│ ISBN 9780132350884             │
│                                │
│ S/ 90.00             precio    │
│                                │
├────────────────────────────────┤  ← barra fija al pie en móvil
│ S/ 90.00 [ Agregar al carrito ]│
└────────────────────────────────┘
```

**Estados**

| Estado | Qué se ve |
|---|---|
| Cargando | Esqueleto de la portada y de las líneas de texto |
| Agregado | Aviso breve "Libro agregado" con [ Deshacer ]; el botón pasa a "Agregar otro (1)" y aparece el enlace "Ver carrito" |
| Sin sesión | Al pulsar [ Agregar al carrito ] va a `/ingresar` con el aviso "Entra para armar tu carrito"; tras entrar vuelve aquí **sin** agregar (DP-12) |
| Tope de 10 | El botón se deshabilita y se lee "Máximo 10 unidades por libro en cada pedido" |
| No disponible | `StatePanel` "Este libro no está disponible" con enlace a los libros (libro inexistente, inactivo o ISBN mal formado) |

No se muestra stock (RN-13). **Escritorio:** dos columnas: portada a la izquierda; título, autor, ISBN, precio y botón a la derecha. La barra fija desaparece.

---

## PA-03 Registrarse

`/registro` · público · [HU-01](../04-historias-de-usuario.md#hu-01-registrarme)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒    │
├────────────────────────────────┤
│ Crea tu cuenta              h1 │
│ Para armar tu carrito y comprar│
│                                │
│ Correo electrónico             │
│ ┌────────────────────────────┐ │
│ │ ana@example.com            │ │
│ └────────────────────────────┘ │
│ Contraseña                     │
│ ┌──────────────────────┐ ┌──┐  │
│ │ ••••••••••••         │ │👁│  │
│ └──────────────────────┘ └──┘  │
│ Al menos 10 caracteres         │
│                                │
│ [ Crear cuenta ]            ═══│
│                                │
│ ¿Ya tienes cuenta? Entra       │
└────────────────────────────────┘
```

**Estados:** un error de campo (`EMAIL_ALREADY_REGISTERED` con enlace "¿Quieres entrar?", `WEAK_PASSWORD`, `INVALID_EMAIL`) aparece **debajo del campo**, con icono y en `--destructive`, y el foco va al primero. El botón se deshabilita y muestra "Creando tu cuenta…" mientras la petición está en curso. Si la cuenta se crea pero el inicio de sesión automático falla: se va a `PA-04` con el correo escrito y el aviso "Cuenta creada. Entra para continuar".

**Escritorio:** formulario de 400 px centrado, sobre fondo crema.

---

## PA-04 Iniciar sesión

`/ingresar` · público · [HU-02](../04-historias-de-usuario.md#hu-02-iniciar-sesión), [HU-03](../04-historias-de-usuario.md#hu-03-mantener-la-sesión)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒    │
├────────────────────────────────┤
│ ┌ ℹ Entra para armar tu carrito┐│  ← aviso, solo si vino por una acción
│ └────────────────────────────┘ │
│ Entra a tu cuenta           h1 │
│                                │
│ Correo electrónico             │
│ ┌────────────────────────────┐ │
│ └────────────────────────────┘ │
│ Contraseña                     │
│ ┌──────────────────────┐ ┌──┐  │
│ └──────────────────────┘ │👁│  │
│                          └──┘  │
│ [ Entrar ]                  ═══│
│                                │
│ ¿No tienes cuenta? Crea una    │
└────────────────────────────────┘
```

**Estados:** `INVALID_CREDENTIALS` es **un solo** mensaje sobre el formulario ("Correo o contraseña incorrectos"), sin decir cuál falla. Si llegó por una sesión que terminó: aviso `info` "Tu sesión terminó. Entra de nuevo para continuar." Tras entrar vuelve a la ruta de origen (`returnTo`) o al catálogo. `429` muestra "Hiciste demasiados intentos…".

---

## PA-05 Carrito

`/carrito` · con sesión · [HU-20 a HU-22](../04-historias-de-usuario.md#carrito)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │
├────────────────────────────────┤
│ Tu carrito                  h1 │
│                                │
│ ┌────────────────────────────┐ │
│ │ ▓▓  Clean Code             │ │
│ │ ▓▓  Robert C. Martin       │ │
│ │ ▓▓  S/ 90.00 c/u           │ │
│ │     [ 2 ▾ ]      S/ 180.00 │ │
│ │     Quitar                 │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ ▓▓  Refactoring            │ │
│ │ ▓▓  M. Fowler              │ │
│ │ ▓▓  S/ 80.00 c/u           │ │
│ │     [ 1 ▾ ]       S/ 80.00 │ │
│ │     Quitar                 │ │
│ └────────────────────────────┘ │
│                                │
│ ┌ Resumen ───────────────────┐ │
│ │ Subtotal          S/ 260.00│ │
│ │ Descuento                 —│ │
│ │ Envío                Gratis│ │
│ │ ────────────────────────── │ │
│ │ Total a pagar     S/ 260.00│═│
│ │ Envío S/ 10.00 · gratis    │ │
│ │ desde S/ 150.00            │ │
│ └────────────────────────────┘ │
│                                │
├────────────────────────────────┤  ← barra fija al pie en móvil
│ S/ 260.00 [ Continuar con la compra ] │
└────────────────────────────────┘
```

**Estados**

| Estado | Qué se ve |
|---|---|
| Vacío | `StatePanel`: "Tu carrito está vacío." y [ Ver libros ] |
| Cotizando | Montos del resumen atenuados, "Calculando tu total…"; el botón de continuar deshabilitado |
| Error de cotización | `Alert` "No pudimos calcular tu total" con [ Reintentar ]; sin continuar |
| Precio cambiado | La línea lleva un aviso `warning` con el precio nuevo ("El precio cambió: ahora S/ 95.00") |
| No disponible | La línea atenuada con aviso "Este libro ya no está disponible", sin selector; se bloquea continuar hasta quitarla |
| Tope de 10 / otra moneda | Aviso breve al intentar agregar (HU-20) |
| Quitar | Aviso breve "Quitado del carrito" con [ Deshacer ] unos segundos |
| Hasta que exista la cotización (corte 8) | Líneas con precio unitario y cantidad, **sin** subtotal de línea ni resumen |

**Escritorio:** dos columnas: las líneas a la izquierda (65 %), el resumen fijo a la derecha (35 %, pegajoso al desplazarse). La barra fija de móvil desaparece y el botón va dentro del resumen.

---

## PA-06 Dirección y pago

`/compra` · con sesión · [HU-30 a HU-33](../04-historias-de-usuario.md#compra)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │
├────────────────────────────────┤
│ ‹ Volver al carrito            │
│ Finaliza tu compra          h1 │
│                                │
│ ▸ Resumen · 3 libros · S/ 260.00│  ← se despliega
│                                │
│ Envío                       h2 │
│ Destinatario  [______________] │
│ Teléfono      [______________] │
│ Dirección     [______________] │
│ Distrito      [______________] │
│ Provincia     [______________] │
│ Departamento  [______________] │
│ Referencia (opcional) [______] │
│                                │
│ Pago                        h2 │
│ ┌ Tarjeta ───────────────────┐ │
│ │ (en desarrollo: tarjeta de │ │
│ │  prueba  [ Aprobada ▾ ])   │ │
│ └────────────────────────────┘ │
│                                │
│ Total a pagar         S/ 260.00│═
│ [ Pagar S/ 260.00 ]         ═══│
│ Tu tarjeta no pasa por LibroYa │
└────────────────────────────────┘
```

**La tarjeta:** mientras la pasarela sea simulada (DP-06), el bloque de pago es un selector de **tarjeta de prueba** (aprobada, rechazada, error del servidor) que solo existe fuera de producción; cuando haya proveedor real, lo sustituye su campo seguro. La tarjeta real nunca pasa por LibroYa (RN-24).

**Estados** (los de la [máquina de pago](../../frontend/04-flujos-de-pantalla.md#5-pago-pa-06); ver `PaymentStatus` en [02](02-componentes.md#paymentstatus))

| Estado | Qué se ve |
|---|---|
| Cotizando | Total atenuado y [ Pagar ] deshabilitado |
| Listo | [ Pagar S/ 260.00 ] activo |
| Enviando | Panel `info` "Procesando tu pago… No cierres esta página."; el formulario y el botón deshabilitados |
| Esperando | Panel `info` "Estamos procesando tu pago. Espera un momento." |
| Incierto | `Alert` `warning`: "No pudimos confirmar tu pago. Si te llegó un cargo, no te preocupes: no se cobrará dos veces." con [ Reintentar ] |
| Fallido | `Alert` `error` con el mensaje del `errorCode`, si se cobró ("No se te cobró nada") y la acción: [ Volver al carrito ], [ Probar con otra tarjeta ] o la dirección con error marcado |
| Error de campo | Debajo del campo, con el foco en el primero con error |

La dirección empieza vacía en cada compra (DP-13). **Escritorio:** dos columnas: formulario a la izquierda (60 %); resumen y botón de pagar a la derecha (40 %, fijo).

---

## PA-07 Confirmación

`/pedidos/:id/gracias` · con sesión · [HU-34](../04-historias-de-usuario.md#hu-34-ver-la-confirmación)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒    │
├────────────────────────────────┤
│            ✓                   │
│ ¡Gracias por tu compra!     h1 │
│ Te enviamos un email de        │
│ confirmación.                  │
│                                │
│ Pedido  N.º 3F9A1C2E           │
│                                │
│ ┌ Tu pedido ─────────────────┐ │
│ │ Clean Code × 2    S/ 180.00│ │
│ │ Refactoring × 1    S/ 80.00│ │
│ │ ────────────────────────── │ │
│ │ Total cobrado     S/ 260.00│═│
│ └────────────────────────────┘ │
│                                │
│ [ Ver mis pedidos ]         ═══│
│ Seguir comprando               │
└────────────────────────────────┘
```

El número de pedido muestra los primeros 8 caracteres del `id` en mayúsculas, y el `id` completo se puede copiar. Las líneas salen del pedido y **no se calculan**: el total es el `charged` real. **Estados:** cargando (esqueleto); no encontrado ("No encontramos este pedido"). El carrito ya está vacío. **Escritorio:** columna única de 560 px centrada.

---

## PA-08 Mis pedidos

`/pedidos` · con sesión · [HU-40](../04-historias-de-usuario.md#hu-40-ver-mis-pedidos)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │
├────────────────────────────────┤
│ Mis pedidos                 h1 │
│                                │
│ ┌────────────────────────────┐ │
│ │ 28 oct 2026, 10:00         │ │
│ │ N.º 3F9A1C2E  (Realizado)  │ │
│ │ 3 libros          S/ 260.00│ │
│ │ [ Ver detalle ]            │ │
│ └────────────────────────────┘ │
│ ┌────────────────────────────┐ │
│ │ 21 oct 2026, 18:42         │ │
│ │ …                          │ │
│ └────────────────────────────┘ │
│                                │
│ [ Cargar más pedidos ]         │
└────────────────────────────────┘
```

**Estados:** cargando (esqueleto de tarjetas); vacío ("Aún no has hecho ninguna compra." y [ Ver libros ]); error con [ Reintentar ]. El estado del pedido se traduce: `PLACED` → "Realizado". La fecha usa la zona de Lima. **Escritorio:** lista de una columna de hasta 720 px; cada pedido, una fila con la fecha a la izquierda y el total a la derecha.

---

## PA-09 Detalle del pedido

`/pedidos/:id` · con sesión · [HU-41](../04-historias-de-usuario.md#hu-41-ver-el-detalle-de-un-pedido)

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒 2  │
├────────────────────────────────┤
│ ‹ Mis pedidos                  │
│ Pedido N.º 3F9A1C2E         h1 │
│ 28 oct 2026, 10:00 (Realizado) │
│                                │
│ Libros                      h2 │
│ ┌────────────────────────────┐ │
│ │ ▓▓ Clean Code              │ │
│ │ ▓▓ 2 × S/ 90.00            │ │
│ ├────────────────────────────┤ │
│ │ ▓▓ Refactoring             │ │
│ │ ▓▓ 1 × S/ 80.00            │ │
│ └────────────────────────────┘ │
│                                │
│ Total cobrado         S/ 260.00│═
│                                │
│ Envío                       h2 │  ← solo si la API trae la dirección
│ María Quispe                   │
│ +51 987 654 321                │
│ Jr. Ucayali 150, Dpto 2        │
│ Barranco, Lima, Lima           │
└────────────────────────────────┘
```

Los precios son **los de la compra** (RN-01), no los actuales. **Estados:** cargando; no encontrado ("No encontramos este pedido": pedido ajeno, inexistente o `id` que no es un UUID, todos iguales). La sección "Envío" solo aparece si el pedido trae `shippingAddress` (DP-15). **Escritorio:** columna única de 720 px.

---

## PA-10 No encontrado / error

`*` · público

```text
┌────────────────────────────────┐
│ ☰   LibroYa        🔍    🛒    │
├────────────────────────────────┤
│                                │
│ No encontramos esta página  h1 │
│ Puede que el enlace esté       │
│ incompleto o que ya no exista. │
│                                │
│ [ Ir a los libros ]         ═══│
└────────────────────────────────┘
```

Es también la pantalla de **error inesperado** de la aplicación (con "Algo salió mal. Inténtalo de nuevo en unos minutos." y el código de soporte), para que ninguna falla deje la pantalla en blanco.
