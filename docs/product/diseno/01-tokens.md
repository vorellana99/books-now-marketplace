# Tokens de diseño

> Los valores base de la interfaz. Se escriben con los **nombres de las variables de shadcn/ui** (`--background`, `--primary`…) para que los componentes funcionen sin traducir nada, y viven en un solo archivo (`src/styles.css`, con `@theme` de Tailwind 4). Propuesta modificable ([README](README.md)).

## Colores

Los contrastes están **calculados** (relación de contraste WCAG) contra el fondo sobre el que se usan. Objetivos: texto ≥ 4.5:1, bordes y controles ≥ 3:1 (WCAG 2.2 AA).

### Base

| Token | Valor | Para qué | Contraste |
|---|---|---|---|
| `--background` | `#FBF8F3` (crema) | Fondo de la página | — |
| `--foreground` | `#1F1A17` (tinta) | Texto principal | 16.3:1 sobre el fondo |
| `--card`, `--popover` | `#FFFFFF` | Tarjetas, menús, formularios | — |
| `--card-foreground` | `#1F1A17` | Texto sobre tarjetas | 17.2:1 |
| `--muted` | `#F3EDE4` | Zonas hundidas (resúmenes, esqueletos) | — |
| `--muted-foreground` | `#5E554D` | Texto secundario (autor, ayudas, fechas) | 6.9:1 sobre el fondo, 6.3:1 sobre `--muted` |
| `--secondary`, `--accent` | `#F3EDE4` | Botón secundario y estado de pasar el cursor | — |
| `--secondary-foreground`, `--accent-foreground` | `#1F1A17` | Texto de lo anterior | — |
| `--border` | `#E6DED3` | **Solo separadores decorativos** (líneas entre filas, bordes de tarjeta) | 1.3:1 (decorativo, no comunica nada por sí solo) |
| `--input` | `#8A7F74` | **Borde de campos de formulario y controles** | 3.7:1 sobre el fondo y 3.9:1 sobre blanco (≥ 3:1) |
| `--ring` | `#1E5FA8` (azul) | Anillo de foco | 6.1:1 sobre el fondo |

### Acento y estados

| Token | Valor | Para qué | Contraste |
|---|---|---|---|
| `--primary` | `#7A2E3A` (granate) | Botón principal, enlaces, acento de marca | 9.2:1 sobre blanco y 8.7:1 sobre el fondo |
| `--primary-foreground` | `#FFFFFF` | Texto sobre `--primary` | 9.2:1 |
| `--primary-hover` | `#64232E` | Botón principal al pasar el cursor | 11.5:1 con texto blanco |
| `--destructive` | `#B3261E` | Errores y acciones destructivas | 6.2:1 sobre el fondo |
| `--destructive-foreground` | `#FFFFFF` | Texto sobre `--destructive` | 6.5:1 |
| `--success` / `--success-bg` | `#1F5A33` / `#E8F3EA` | Confirmaciones | 7.2:1 |
| `--warning` / `--warning-bg` | `#7A4B00` / `#FFF3DC` | Avisos (precio cambiado, "no disponible") | 6.7:1 |
| `--info` / `--info-bg` | `#1B4F8A` / `#E8F0FA` | Información neutra (procesando, ayudas) | 7.2:1 |
| `--danger-text` / `--danger-bg` | `#8C1D18` / `#FCEBEA` | Texto de un aviso de error sobre su fondo | 7.9:1 |
| `--gold` | `#C8963E` | **Solo decorativo**, por ejemplo la insignia "Envío gratis" (con texto `--foreground` encima) | 6.5:1 con texto tinta |

**Reglas de uso**

- **El color nunca es el único canal.** Un error lleva icono y texto además del rojo; un campo inválido, un mensaje debajo.
- **El anillo de foco se dibuja con un espacio** (2 px de borde, 2 px de separación) para que se vea sobre botones del mismo tono: sobre el granate, el azul solo tiene 1.4:1, pero sobre el fondo con el espacio intermedio llega a 6.1:1.
- **Un solo acento.** El granate es el único color de acción; el dorado no se usa en botones ni enlaces.
- **Texto atenuado:** no se usa un gris más claro que `--muted-foreground`.

### Colores de la portada tipográfica

Seis tonos oscuros para el fondo de la portada generada de cada libro; todos con texto blanco ≥ 6.3:1:

| Nombre | Valor | Contraste con blanco |
|---|---|---|
| granate | `#7A2E3A` | 9.2:1 |
| verde | `#2F5D50` | 7.5:1 |
| azul | `#2B4A6F` | 9.1:1 |
| ocre | `#7A5A1E` | 6.4:1 |
| ciruela | `#5B3A66` | 9.4:1 |
| pizarra | `#3F4A52` | 9.1:1 |

## Tipografía

| Rol | Tipo | Notas |
|---|---|---|
| **Títulos** | `Source Serif 4` (variable), con *fallback* a `Georgia, serif` | Títulos de página (`h1`, `h2`) y título del libro |
| **Texto e interfaz** | `Inter` (variable), con *fallback* a `system-ui, sans-serif` | Todo lo demás: botones, formularios, listas |
| **Cifras** | Inter con `font-variant-numeric: tabular-nums` | **Todos los montos**: las cifras alinean en columna |

Las dos se **sirven desde el propio sitio** (paquetes `@fontsource-variable/*`), no desde un servicio externo: evita una petición de terceros y mejora el rendimiento ([08](../08-requisitos-de-experiencia.md)). Solo se cargan los pesos y el subconjunto latino que se usan.

### Escala

Móvil primero; el texto de un campo **nunca baja de 16 px** (en iOS, menos hace que el navegador amplíe la pantalla al enfocar).

| Estilo | Móvil | Escritorio (≥ 1024) | Uso |
|---|---|---|---|
| `h1` | 28 / 34, serif, semibold | 36 / 42 | Título de pantalla |
| `h2` | 22 / 28, serif, semibold | 24 / 30 | Secciones ("Envío", "Resumen") |
| `h3` | 18 / 26, sans, semibold | igual | Títulos de tarjeta |
| Cuerpo | 16 / 24 | igual | Texto general |
| Pequeño | 14 / 20 | igual | Ayudas, fechas, ISBN. **No se usa menos de 14** |
| Monto grande | 24 / 30, sans, bold, cifras tabulares | 28 / 34 | El total del carrito, del pago y de la confirmación |

Largo de línea máximo en texto corrido: **70 caracteres** (`max-w-prose`).

## Espaciado y maquetación

| Token | Valor |
|---|---|
| Unidad base | 4 px (la escala de Tailwind: 4, 8, 12, 16, 24, 32, 48, 64) |
| Margen lateral de la página | 16 px en móvil, 24 px desde 768 px |
| Ancho máximo del contenido | 1120 px, centrado |
| Separación entre secciones | 32 px en móvil, 48 px en escritorio |
| Puntos de quiebre | Los de Tailwind: `sm` 640, `md` 768, `lg` 1024 |
| Objetivo táctil | **44 × 44 px como mínimo** ([08](../08-requisitos-de-experiencia.md)) |

## Forma, profundidad y movimiento

| Token | Valor | Notas |
|---|---|---|
| `--radius` | `8px` | Botones, campos, tarjetas. Hojas inferiores y diálogos: 12 px |
| Borde de tarjeta | 1 px `--border` | La profundidad la da el borde, no la sombra |
| Sombra | `0 1px 2px rgba(31,26,23,.06)` | Solo tarjetas elevadas y menús |
| Grosor del foco | 2 px, con 2 px de separación | Siempre visible; nunca se quita sin sustituirlo |
| Duración | 150 ms, `ease-out` | Cambios de estado, apertura de menús |
| Movimiento reducido | Con `prefers-reduced-motion`, sin animaciones de desplazamiento ni de aparición | Solo quedan los cambios de color |

## Cómo se escriben en el código

Fragmento ilustrativo de `src/styles.css` (Tailwind 4). Los nombres coinciden con los de shadcn/ui:

```css
@import "tailwindcss";

:root {
  --background: #fbf8f3;
  --foreground: #1f1a17;
  --card: #ffffff;
  --card-foreground: #1f1a17;
  --popover: #ffffff;
  --popover-foreground: #1f1a17;
  --primary: #7a2e3a;
  --primary-foreground: #ffffff;
  --secondary: #f3ede4;
  --secondary-foreground: #1f1a17;
  --muted: #f3ede4;
  --muted-foreground: #5e554d;
  --accent: #f3ede4;
  --accent-foreground: #1f1a17;
  --destructive: #b3261e;
  --destructive-foreground: #ffffff;
  --border: #e6ded3;
  --input: #8a7f74;
  --ring: #1e5fa8;
  --radius: 0.5rem;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* … el resto, igual */
  --font-serif: "Source Serif 4 Variable", Georgia, serif;
  --font-sans: "Inter Variable", system-ui, sans-serif;
}
```

Cuando exista el modo oscuro, un bloque `.dark { … }` redefine las mismas variables; los componentes no cambian.
